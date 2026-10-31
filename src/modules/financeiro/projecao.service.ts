import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { hoje } from '../../common/datas';
import { centavos, reais } from '../../common/dinheiro';
import { datasDaCompetencia, mesSeguinte } from '../contratos/geracao.service';
import { DespesaRecorrente, SituacaoDespesa } from '../despesas-recorrentes/despesa-recorrente.entity';
import { ocorrencias, PrevisaoDespesas, somarMesesCompetencia } from '../despesas-recorrentes/ocorrencias';
import { MovimentacoesService } from '../movimentacoes/movimentacoes.service';
import { ProjecaoDto } from './dto/projecao.dto';

/** Até quantos dias à frente a projeção vai. */
export const MAXIMO_DIAS_PROJECAO = 731;

export type TipoPrevisto = 'RECEBER' | 'PAGAR' | 'CONTRATO' | 'RECORRENTE';

export interface LancamentoPrevisto {
  tipo: TipoPrevisto;
  descricao: string;
  pessoa: string;
  valor: number;
  vencimento: string;
  /** Valor previsto, não o definitivo (despesa variável, sobre o faturamento, ou conta lançada com estimativa). */
  estimado: boolean;
}

interface LinhaConta {
  vencimento: string;
  descricao: string;
  pessoa: string;
  valor: string;
  estimada: boolean;
}

/** Saldo em aberto (valor menos o principal já baixado) de cada conta não quitada que vence até $2. */
const SQL_ABERTAS = (tabela: 'contas_receber' | 'contas_pagar', chave: string, pessoas: 'clientes' | 'fornecedores', pessoa: string) => `
  SELECT c.data_vencimento::text AS vencimento, c.descricao, p.nome AS pessoa,
         ${tabela === 'contas_pagar' ? 'c.estimada' : 'false'} AS estimada,
         c.valor - COALESCE((SELECT SUM(b.valor) FROM baixas b WHERE b.${chave} = c.id), 0) AS valor
    FROM ${tabela} c JOIN ${pessoas} p ON p.id = c.${pessoa}
   WHERE c.empresa_id = $1 AND c.status IN ('ABERTA', 'PARCIAL') AND c.data_vencimento <= $2
   ORDER BY c.data_vencimento`;

const somarDias = (data: string, dias: number) => {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/**
 * Projeção do caixa dia a dia, a partir do saldo bancário de hoje: o que está para entrar (contas a receber em
 * aberto e mensalidades de contratos ainda não faturadas) e para sair (contas a pagar em aberto, inclusive as
 * faturas de cartão, e despesas recorrentes ainda não lançadas). As contas vencidas vêm à parte, para a tela decidir se conta com elas; os cenários e as
 * simulações são calculados na tela, sobre estes dados.
 */
@Injectable()
export class ProjecaoService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly movimentacoes: MovimentacoesService,
  ) {}

  async projecao(empresaId: string, dto: ProjecaoDto) {
    const dia = hoje();
    const { ate } = dto;
    if (ate <= dia) throw new BadRequestException('A projeção precisa terminar depois de hoje');
    if (ate > somarDias(dia, MAXIMO_DIAS_PROJECAO)) {
      throw new BadRequestException(`A projeção pode ir até ${MAXIMO_DIAS_PROJECAO} dias à frente`);
    }

    const [saldos, receber, pagar, contratos, despesas] = await Promise.all([
      this.movimentacoes.saldos(empresaId, dia),
      this.dataSource.query(SQL_ABERTAS('contas_receber', 'conta_receber_id', 'clientes', 'cliente_id'), [empresaId, ate]) as Promise<LinhaConta[]>,
      this.dataSource.query(SQL_ABERTAS('contas_pagar', 'conta_pagar_id', 'fornecedores', 'fornecedor_id'), [empresaId, ate]) as Promise<LinhaConta[]>,
      this.contratosAFaturar(empresaId, dia, ate),
      this.despesasALancar(empresaId, dia, ate),
    ]);

    const lancamento = (tipo: TipoPrevisto, l: LinhaConta): LancamentoPrevisto => ({
      tipo,
      descricao: l.descricao,
      pessoa: l.pessoa,
      valor: reais(centavos(l.valor)),
      vencimento: l.vencimento,
      estimado: l.estimada,
    });
    const todos = [
      ...receber.map((l) => lancamento('RECEBER', l)),
      ...pagar.map((l) => lancamento('PAGAR', l)),
      ...contratos,
      ...despesas,
    ].filter((l) => l.valor > 0);

    // Previsões (mensalidade a faturar, despesa a lançar) de um vencimento que já passou contam como de hoje;
    // contas de verdade vencidas vão para os atrasados.
    const previsao = (l: LancamentoPrevisto) => l.tipo === 'CONTRATO' || l.tipo === 'RECORRENTE';
    const atrasados = todos.filter((l) => l.vencimento < dia && !previsao(l));
    const porDia = new Map<string, { receber: number; pagar: number; contratos: number; recorrentes: number; lancamentos: LancamentoPrevisto[] }>();
    const CAMPOS = { RECEBER: 'receber', PAGAR: 'pagar', CONTRATO: 'contratos', RECORRENTE: 'recorrentes' } as const;
    for (const l of todos) {
      if (l.vencimento < dia && !previsao(l)) continue;
      const data = l.vencimento < dia ? dia : l.vencimento;
      const d = porDia.get(data) ?? { receber: 0, pagar: 0, contratos: 0, recorrentes: 0, lancamentos: [] };
      const campo = CAMPOS[l.tipo];
      d[campo] += centavos(l.valor);
      d.lancamentos.push(l);
      porDia.set(data, d);
    }
    const soma = (lista: LancamentoPrevisto[]) => reais(lista.reduce((s, l) => s + centavos(l.valor), 0));
    const atrasadosReceber = atrasados.filter((l) => l.tipo === 'RECEBER');
    const atrasadosPagar = atrasados.filter((l) => l.tipo === 'PAGAR');

    return {
      hoje: dia,
      ate,
      saldoAtual: saldos.total,
      contasBancarias: saldos.contas.filter((c) => c.contaBancaria.ativo).map((c) => ({ nome: c.contaBancaria.nome, saldo: c.saldo })),
      atrasados: {
        receber: soma(atrasadosReceber),
        pagar: soma(atrasadosPagar),
        lancamentosReceber: atrasadosReceber,
        lancamentosPagar: atrasadosPagar,
      },
      dias: [...porDia.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([data, d]) => ({
          data,
          receber: reais(d.receber),
          pagar: reais(d.pagar),
          contratos: reais(d.contratos),
          recorrentes: reais(d.recorrentes),
          lancamentos: d.lancamentos.sort((a, b) => b.valor - a.valor),
        })),
    };
  }

  /**
   * Despesas recorrentes ativas cujas contas a pagar ainda não foram lançadas, com o valor previsto (fixo, média das
   * últimas contas reais ou percentual do faturamento) e o vencimento já levado ao dia útil. As já lançadas estão
   * nas contas a pagar.
   */
  private async despesasALancar(empresaId: string, dia: string, ate: string): Promise<LancamentoPrevisto[]> {
    const despesas = await this.dataSource.getRepository(DespesaRecorrente).find({
      where: { empresaId, situacao: SituacaoDespesa.ATIVA },
      relations: { fornecedor: true },
    });
    if (!despesas.length) return [];
    const mesAtual = dia.slice(0, 7);
    const ids = despesas.map((d) => d.id);
    const [previsao, lancadas] = await Promise.all([
      PrevisaoDespesas.carregar(this.dataSource.manager, empresaId, mesAtual, ids),
      this.dataSource.query(`SELECT despesa_recorrente_id AS id, competencia_recorrente AS competencia FROM contas_pagar WHERE despesa_recorrente_id = ANY($1)`, [
        ids,
      ]) as Promise<{ id: string; competencia: string }[]>,
    ]);
    const jaLancada = new Set(lancadas.map((l) => `${l.id}:${l.competencia}`));
    return despesas.flatMap((d) =>
      ocorrencias(d, somarMesesCompetencia(mesAtual, -1), ate)
        .filter((o) => !jaLancada.has(`${d.id}:${o.competencia}`))
        .map((o) => {
          const { valor, estimado } = previsao.valorEm(d, o.competencia);
          return {
            tipo: 'RECORRENTE' as const,
            descricao: `${d.descricao} - ${o.competencia.slice(5)}/${o.competencia.slice(0, 4)}`,
            pessoa: d.fornecedor.nome,
            valor,
            vencimento: o.vencimento,
            estimado,
          };
        }),
    );
  }

  /**
   * Mensalidades dos contratos ativos que ainda não viraram conta a receber (sem venda faturada no mês), do mês
   * passado até o vencimento caber no período. As já faturadas estão nas contas a receber.
   */
  private async contratosAFaturar(empresaId: string, dia: string, ate: string): Promise<LancamentoPrevisto[]> {
    const [contratos, faturadas] = await Promise.all([
      this.dataSource.query(
        `SELECT c.id, c.numero, c.descricao, c.inicio, c.fim, c.dia_faturamento AS "diaFaturamento",
                c.dia_vencimento AS "diaVencimento", c.valor, p.nome AS pessoa
           FROM contratos c JOIN clientes p ON p.id = c.cliente_id
          WHERE c.empresa_id = $1 AND c.situacao = 'ATIVO'`,
        [empresaId],
      ) as Promise<{ id: string; numero: number; descricao: string; inicio: string; fim: string | null; diaFaturamento: number; diaVencimento: number; valor: string; pessoa: string }[]>,
      this.dataSource.query(
        `SELECT contrato_id AS "contratoId", competencia_contrato AS competencia
           FROM vendas WHERE empresa_id = $1 AND contrato_id IS NOT NULL AND status = 'FATURADA'`,
        [empresaId],
      ) as Promise<{ contratoId: string; competencia: string }[]>,
    ]);
    const jaFaturada = new Set(faturadas.map((f) => `${f.contratoId}:${f.competencia}`));
    const lista: LancamentoPrevisto[] = [];
    const ultimo = ate.slice(0, 7);
    for (const c of contratos) {
      for (let competencia = mesSeguinte(dia.slice(0, 7), -1); competencia <= ultimo; competencia = mesSeguinte(competencia)) {
        if (competencia < c.inicio || (c.fim && competencia > c.fim) || jaFaturada.has(`${c.id}:${competencia}`)) continue;
        const { vencimento } = datasDaCompetencia(c, competencia);
        if (vencimento > ate) continue;
        lista.push({
          tipo: 'CONTRATO',
          descricao: `Contrato nº ${c.numero} - ${c.descricao} (${competencia.slice(5)}/${competencia.slice(0, 4)})`,
          pessoa: c.pessoa,
          valor: reais(centavos(c.valor)),
          vencimento,
          estimado: false,
        });
      }
    }
    return lista;
  }
}

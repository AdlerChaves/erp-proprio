import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { hoje } from '../../common/datas';
import { centavos, reais } from '../../common/dinheiro';
import { MovimentacoesService } from '../movimentacoes/movimentacoes.service';
import { TipoPlanoConta } from '../plano-contas/plano-conta.entity';
import { PlanoContasService } from '../plano-contas/plano-contas.service';
import { DreDto } from './dto/dre.dto';
import { FluxoCaixaDto } from './dto/fluxo-caixa.dto';

const MAXIMO_DIAS = 366;

const diaAnterior = (data: string) => {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/** Todos os dias ou meses (AAAA-MM) entre de e ate, inclusive. */
function periodos(de: string, ate: string, agrupamento: 'dia' | 'mes') {
  const lista: string[] = [];
  if (agrupamento === 'dia') {
    for (const d = new Date(`${de}T00:00:00Z`); d.toISOString().slice(0, 10) <= ate; d.setUTCDate(d.getUTCDate() + 1)) {
      lista.push(d.toISOString().slice(0, 10));
    }
  } else {
    for (const d = new Date(`${de.slice(0, 7)}-01T00:00:00Z`); d.toISOString().slice(0, 7) <= ate.slice(0, 7); d.setUTCMonth(d.getUTCMonth() + 1)) {
      lista.push(d.toISOString().slice(0, 7));
    }
  }
  return lista;
}

/** Saldo em aberto de cada conta não quitada: valor menos o principal já baixado. */
const SQL_EM_ABERTO = (tabela: 'contas_receber' | 'contas_pagar', chave: 'conta_receber_id' | 'conta_pagar_id') => `
  SELECT c.data_vencimento::text AS data,
         c.valor - COALESCE((SELECT SUM(b.valor) FROM baixas b WHERE b.${chave} = c.id), 0) AS valor
    FROM ${tabela} c
   WHERE c.empresa_id = $1 AND c.status IN ('ABERTA', 'PARCIAL')`;

interface Linha {
  data: string;
  valor: string;
}

@Injectable()
export class RelatoriosService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly movimentacoes: MovimentacoesService,
    private readonly planoContas: PlanoContasService,
  ) {}

  /**
   * Realizado: movimentações bancárias (sem transferências, que não mudam o caixa da empresa).
   * Previsto: saldo em aberto das contas pelo vencimento.
   * O saldo de cada período acumula os dois a partir do saldo bancário na véspera de "de".
   */
  async fluxoCaixa(empresaId: string, filtro: FluxoCaixaDto) {
    const { de, ate } = filtro;
    const agrupamento = filtro.agrupamento ?? 'mes';
    if (ate < de) throw new BadRequestException('ate não pode ser anterior a de');
    const chaves = periodos(de, ate, agrupamento);
    if (agrupamento === 'dia' && chaves.length > MAXIMO_DIAS) {
      throw new BadRequestException(`Por dia, o período pode ter no máximo ${MAXIMO_DIAS} dias`);
    }
    const chave = (data: string) => (agrupamento === 'dia' ? data : data.slice(0, 7));

    const [realizado, aReceber, aPagar, atrasoReceber, atrasoPagar, saldos] = await Promise.all([
      this.dataSource.query(
        `SELECT data::text AS data, tipo, SUM(valor) AS valor
           FROM movimentacoes_bancarias
          WHERE empresa_id = $1 AND origem <> 'TRANSFERENCIA' AND data BETWEEN $2 AND $3
          GROUP BY data, tipo`,
        [empresaId, de, ate],
      ) as Promise<(Linha & { tipo: 'ENTRADA' | 'SAIDA' })[]>,
      this.dataSource.query(`${SQL_EM_ABERTO('contas_receber', 'conta_receber_id')} AND c.data_vencimento BETWEEN $2 AND $3`, [empresaId, de, ate]) as Promise<Linha[]>,
      this.dataSource.query(`${SQL_EM_ABERTO('contas_pagar', 'conta_pagar_id')} AND c.data_vencimento BETWEEN $2 AND $3`, [empresaId, de, ate]) as Promise<Linha[]>,
      this.dataSource.query(`${SQL_EM_ABERTO('contas_receber', 'conta_receber_id')} AND c.data_vencimento < $2`, [empresaId, hoje()]) as Promise<Linha[]>,
      this.dataSource.query(`${SQL_EM_ABERTO('contas_pagar', 'conta_pagar_id')} AND c.data_vencimento < $2`, [empresaId, hoje()]) as Promise<Linha[]>,
      this.movimentacoes.saldos(empresaId, diaAnterior(de)),
    ]);

    const zerado = () => ({ realizadoEntradas: 0, realizadoSaidas: 0, previstoEntradas: 0, previstoSaidas: 0 });
    const porPeriodo = new Map(chaves.map((c) => [c, zerado()]));
    for (const r of realizado) {
      const p = porPeriodo.get(chave(r.data))!;
      if (r.tipo === 'ENTRADA') p.realizadoEntradas += centavos(r.valor);
      else p.realizadoSaidas += centavos(r.valor);
    }
    for (const r of aReceber) porPeriodo.get(chave(r.data))!.previstoEntradas += centavos(r.valor);
    for (const r of aPagar) porPeriodo.get(chave(r.data))!.previstoSaidas += centavos(r.valor);

    const saldoInicial = centavos(saldos.total);
    let saldo = saldoInicial;
    const totais = zerado();
    const linhas = chaves.map((periodo) => {
      const p = porPeriodo.get(periodo)!;
      saldo += p.realizadoEntradas - p.realizadoSaidas + p.previstoEntradas - p.previstoSaidas;
      for (const k of Object.keys(totais) as (keyof typeof totais)[]) totais[k] += p[k];
      return {
        periodo,
        realizado: { entradas: reais(p.realizadoEntradas), saidas: reais(p.realizadoSaidas) },
        previsto: { entradas: reais(p.previstoEntradas), saidas: reais(p.previstoSaidas) },
        saldo: reais(saldo),
      };
    });
    const soma = (linhas: Linha[]) => reais(linhas.reduce((s, l) => s + centavos(l.valor), 0));

    return {
      de,
      ate,
      agrupamento,
      saldoInicial: reais(saldoInicial),
      periodos: linhas,
      totais: {
        realizado: { entradas: reais(totais.realizadoEntradas), saidas: reais(totais.realizadoSaidas) },
        previsto: { entradas: reais(totais.previstoEntradas), saidas: reais(totais.previstoSaidas) },
      },
      saldoFinal: reais(saldo),
      /** Contas vencidas até ontem e ainda em aberto, de qualquer data. */
      emAtraso: { receber: soma(atrasoReceber), pagar: soma(atrasoPagar) },
    };
  }

  /** Demonstrativo de resultado: valores por categoria do plano de contas, somados até as contas sintéticas. */
  async dre(empresaId: string, filtro: DreDto) {
    const { de, ate } = filtro;
    const regime = filtro.regime ?? 'competencia';
    if (ate < de) throw new BadRequestException('ate não pode ser anterior a de');

    const porContas =
      regime === 'competencia'
        ? `SELECT 'RECEITA' AS tipo, plano_conta_id, SUM(valor) AS valor FROM contas_receber
            WHERE empresa_id = $1 AND status <> 'CANCELADA' AND data_emissao BETWEEN $2 AND $3 GROUP BY plano_conta_id
           UNION ALL
           SELECT 'DESPESA', plano_conta_id, SUM(valor) FROM contas_pagar
            WHERE empresa_id = $1 AND status <> 'CANCELADA' AND data_emissao BETWEEN $2 AND $3 GROUP BY plano_conta_id`
        : `SELECT 'RECEITA' AS tipo, c.plano_conta_id, SUM(b.valor_total) AS valor
             FROM baixas b JOIN contas_receber c ON c.id = b.conta_receber_id
            WHERE b.empresa_id = $1 AND b.data BETWEEN $2 AND $3 GROUP BY c.plano_conta_id
           UNION ALL
           SELECT 'DESPESA', c.plano_conta_id, SUM(b.valor_total)
             FROM baixas b JOIN contas_pagar c ON c.id = b.conta_pagar_id
            WHERE b.empresa_id = $1 AND b.data BETWEEN $2 AND $3 GROUP BY c.plano_conta_id`;
    const linhas: { tipo: TipoPlanoConta; plano_conta_id: string | null; valor: string }[] = await this.dataSource.query(
      `${porContas}
       UNION ALL
       SELECT CASE WHEN tipo = 'ENTRADA' THEN 'RECEITA' ELSE 'DESPESA' END, plano_conta_id, SUM(valor)
         FROM movimentacoes_bancarias
        WHERE empresa_id = $1 AND origem = 'AVULSA' AND data BETWEEN $2 AND $3
        GROUP BY tipo, plano_conta_id`,
      [empresaId, de, ate],
    );

    const plano = await this.planoContas.findAll(empresaId, {});
    const pais = new Map(plano.map((c) => [c.id, c.contaPaiId]));
    const valores = new Map<string, number>();
    const semCategoria = { [TipoPlanoConta.RECEITA]: 0, [TipoPlanoConta.DESPESA]: 0 };
    for (const linha of linhas) {
      const valor = centavos(linha.valor);
      if (!linha.plano_conta_id) {
        semCategoria[linha.tipo] += valor;
        continue;
      }
      for (let id: string | null | undefined = linha.plano_conta_id; id; id = pais.get(id)) {
        valores.set(id, (valores.get(id) ?? 0) + valor);
      }
    }

    const contas = plano
      .filter((c) => valores.has(c.id))
      .map((c) => ({
        id: c.id,
        codigo: c.codigo,
        nome: c.nome,
        tipo: c.tipo,
        nivel: c.codigo.split('.').length,
        valor: reais(valores.get(c.id)!),
      }));
    const totalDoTipo = (tipo: TipoPlanoConta) =>
      plano.filter((c) => c.tipo === tipo && !c.contaPaiId).reduce((s, c) => s + (valores.get(c.id) ?? 0), 0) +
      semCategoria[tipo];
    const receitas = totalDoTipo(TipoPlanoConta.RECEITA);
    const despesas = totalDoTipo(TipoPlanoConta.DESPESA);

    return {
      de,
      ate,
      regime,
      contas,
      semCategoria: { receitas: reais(semCategoria.RECEITA), despesas: reais(semCategoria.DESPESA) },
      receitas: reais(receitas),
      despesas: reais(despesas),
      resultado: reais(receitas - despesas),
    };
  }
}

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Not, QueryFailedError, Repository } from 'typeorm';
import { hoje } from '../../common/datas';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CentrosCustoService } from '../centros-custo/centros-custo.service';
import { ContaPagar } from '../contas-pagar/conta-pagar.entity';
import { ContasPagarService } from '../contas-pagar/contas-pagar.service';
import { FornecedoresService } from '../fornecedores/fornecedores.service';
import { TipoPlanoConta } from '../plano-contas/plano-conta.entity';
import { PlanoContasService } from '../plano-contas/plano-contas.service';
import { DespesaRecorrente, SituacaoDespesa, TipoValorDespesa } from './despesa-recorrente.entity';
import { CreateDespesaRecorrenteDto } from './dto/create-despesa-recorrente.dto';
import { FiltroDespesasDto, UpdateDespesaRecorrenteDto } from './dto/update-despesa-recorrente.dto';
import { lancamentoEm, ocorrencias, PrevisaoDespesas, somarMesesCompetencia } from './ocorrencias';

const mesAno = (competencia: string) => `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`;
/** Até onde procurar próximos vencimentos (uma despesa anual pode estar a 12 meses). */
const HORIZONTE_MESES = 24;

@Injectable()
export class DespesasRecorrentesService {
  private readonly logger = new Logger(DespesasRecorrentesService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(DespesaRecorrente) private readonly repo: Repository<DespesaRecorrente>,
    @InjectRepository(ContaPagar) private readonly contas: Repository<ContaPagar>,
    private readonly fornecedores: FornecedoresService,
    private readonly planoContas: PlanoContasService,
    private readonly centrosCusto: CentrosCustoService,
    private readonly contasPagar: ContasPagarService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** As despesas, cada uma com os próximos vencimentos e o valor previsto deles. */
  async findAll(empresaId: string, filtro: FiltroDespesasDto) {
    const despesas = await this.repo.find({
      where: { empresaId, situacao: filtro.situacao },
      relations: { fornecedor: true, planoConta: true },
      order: { descricao: 'ASC' },
    });
    const proximas = await this.proximas(empresaId, despesas, 3);
    return despesas.map((d) => ({ ...d, proximas: proximas.get(d.id) ?? [] }));
  }

  async findOne(empresaId: string, id: string) {
    const despesa = await this.repo.findOne({ where: { id, empresaId }, relations: { fornecedor: true, planoConta: true, centroCusto: true } });
    if (!despesa) throw new NotFoundException(`Despesa recorrente ${id} não encontrada`);
    const lancadas = await this.contas.find({
      where: { empresaId, despesaRecorrenteId: id },
      order: { competenciaRecorrente: 'DESC' },
      take: 12,
    });
    return { ...despesa, proximas: (await this.proximas(empresaId, [despesa], 6)).get(id) ?? [], lancadas };
  }

  async create(empresaId: string, dto: CreateDespesaRecorrenteDto) {
    await this.validar(empresaId, { ...dto, fim: dto.fim ?? null });
    const despesa = await this.repo.save(
      this.repo.create({
        ...dto,
        descricao: dto.descricao.trim(),
        observacoes: dto.observacoes?.trim() || null,
        ...this.valores(dto.tipoValor, dto),
        empresaId,
      }),
    );
    return this.findOne(empresaId, despesa.id);
  }

  /** Vale para as contas ainda não lançadas. */
  async update(empresaId: string, id: string, dto: UpdateDespesaRecorrenteDto) {
    const atual = await this.findOne(empresaId, id);
    if (atual.situacao === SituacaoDespesa.ENCERRADA) throw new BadRequestException('Despesa encerrada não pode ser alterada');
    const final = { ...atual, ...dto };
    await this.validar(empresaId, final);
    await this.repo.update(id, {
      ...dto,
      ...(dto.descricao !== undefined && { descricao: dto.descricao.trim() }),
      ...(dto.observacoes !== undefined && { observacoes: dto.observacoes?.trim() || null }),
      ...this.valores(final.tipoValor, final),
    });
    return this.findOne(empresaId, id);
  }

  async mudarSituacao(empresaId: string, id: string, situacao: SituacaoDespesa) {
    const despesa = await this.findOne(empresaId, id);
    if (despesa.situacao === SituacaoDespesa.ENCERRADA) throw new BadRequestException('A despesa já está encerrada');
    await this.repo.update(id, { situacao });
    return this.findOne(empresaId, id);
  }

  /** Só sai do cadastro a despesa que nunca lançou conta; as outras são encerradas. */
  async remove(empresaId: string, id: string) {
    await this.findOne(empresaId, id);
    if (await this.contas.exists({ where: { despesaRecorrenteId: id } })) {
      throw new BadRequestException('A despesa já lançou contas a pagar; encerre-a em vez de excluir');
    }
    await this.repo.delete({ id, empresaId });
  }

  /**
   * Lança as contas a pagar que chegaram ao dia (o vencimento menos a antecedência), do mês passado em diante.
   * Lançar de novo é seguro: há uma conta por despesa e mês, e a conta cancelada conta como "mês pulado".
   */
  async lancarPendentes(empresaId: string, opcoes: { hoje?: string; automatica: boolean }) {
    const dia = opcoes.hoje ?? hoje();
    const despesas = await this.repo.findBy({ empresaId, situacao: SituacaoDespesa.ATIVA });
    if (!despesas.length) return 0;
    const previsao = await PrevisaoDespesas.carregar(this.dataSource.manager, empresaId, dia.slice(0, 7), despesas.map((d) => d.id));
    const lancadas = await this.competenciasLancadas(despesas.map((d) => d.id));
    let total = 0;
    for (const d of despesas) {
      const limite = new Date(`${dia}T00:00:00Z`);
      limite.setUTCDate(limite.getUTCDate() + d.diasAntecedencia);
      for (const o of ocorrencias(d, somarMesesCompetencia(dia.slice(0, 7), -1), limite.toISOString().slice(0, 10))) {
        if (lancadas.has(`${d.id}:${o.competencia}`) || lancamentoEm(o.vencimento, d.diasAntecedencia) > dia) continue;
        if (await this.lancar(empresaId, d, o, previsao, dia, opcoes.automatica)) total++;
      }
    }
    return total;
  }

  /** Lança agora a próxima conta ainda não lançada, sem esperar a antecedência. */
  async lancarProxima(empresaId: string, id: string) {
    const d = await this.findOne(empresaId, id);
    if (d.situacao !== SituacaoDespesa.ATIVA) throw new BadRequestException('Só despesas ativas lançam contas');
    const dia = hoje();
    const lancadas = await this.competenciasLancadas([id]);
    const proxima = ocorrencias(d, somarMesesCompetencia(dia.slice(0, 7), -1), `${somarMesesCompetencia(dia.slice(0, 7), HORIZONTE_MESES)}-01`).find(
      (o) => !lancadas.has(`${id}:${o.competencia}`),
    );
    if (!proxima) throw new BadRequestException('Não há próximo vencimento dentro da vigência da despesa');
    const previsao = await PrevisaoDespesas.carregar(this.dataSource.manager, empresaId, dia.slice(0, 7), [id]);
    const conta = await this.lancar(empresaId, d, proxima, previsao, dia, false);
    if (!conta) throw new BadRequestException('O valor previsto desta conta é zero (sem faturamento no mês de base); nada foi lançado');
    return this.findOne(empresaId, id);
  }

  /** Próximos vencimentos (lançados ou não) de cada despesa ativa, com o valor previsto ou o da conta lançada. */
  private async proximas(empresaId: string, despesas: DespesaRecorrente[], quantidade: number) {
    const ativas = despesas.filter((d) => d.situacao === SituacaoDespesa.ATIVA);
    const resultado = new Map<string, { competencia: string; vencimento: string; lancamento: string; valor: number; estimado: boolean; base: string; contaId: string | null }[]>();
    if (!ativas.length) return resultado;
    const dia = hoje();
    const previsao = await PrevisaoDespesas.carregar(this.dataSource.manager, empresaId, dia.slice(0, 7), ativas.map((d) => d.id));
    const contas = await this.contas.find({
      where: { despesaRecorrenteId: In(ativas.map((d) => d.id)), competenciaRecorrente: Not(IsNull()) },
      select: { id: true, despesaRecorrenteId: true, competenciaRecorrente: true, valor: true, estimada: true, status: true },
    });
    const porChave = new Map(contas.map((c) => [`${c.despesaRecorrenteId}:${c.competenciaRecorrente}`, c]));
    for (const d of ativas) {
      const lista = ocorrencias(d, dia.slice(0, 7), `${somarMesesCompetencia(dia.slice(0, 7), HORIZONTE_MESES)}-01`)
        .filter((o) => o.vencimento >= dia || !porChave.has(`${d.id}:${o.competencia}`))
        .slice(0, quantidade)
        .map((o) => {
          const conta = porChave.get(`${d.id}:${o.competencia}`);
          const previsto = previsao.valorEm(d, o.competencia);
          return {
            ...o,
            lancamento: lancamentoEm(o.vencimento, d.diasAntecedencia),
            valor: conta ? conta.valor : previsto.valor,
            estimado: conta ? conta.estimada : previsto.estimado,
            base: conta ? 'Conta lançada' : previsto.base,
            contaId: conta?.id ?? null,
          };
        });
      resultado.set(d.id, lista);
    }
    return resultado;
  }

  private async competenciasLancadas(ids: string[]) {
    const contas = await this.contas.find({
      where: { despesaRecorrenteId: In(ids) },
      select: { despesaRecorrenteId: true, competenciaRecorrente: true },
    });
    return new Set(contas.map((c) => `${c.despesaRecorrenteId}:${c.competenciaRecorrente}`));
  }

  /** Grava a conta a pagar de uma ocorrência; devolve false se já existia ou se o valor previsto é zero. */
  private async lancar(
    empresaId: string,
    d: DespesaRecorrente,
    o: { competencia: string; vencimento: string },
    previsao: PrevisaoDespesas,
    dia: string,
    automatica: boolean,
  ) {
    const { valor, estimado, base } = previsao.valorEm(d, o.competencia);
    if (valor <= 0) return false;
    try {
      await this.dataSource.transaction((m) =>
        this.contasPagar.lancarDaOrigem(m, empresaId, {
          pessoaId: d.fornecedorId,
          descricao: `${d.descricao} - ${mesAno(o.competencia)}`.slice(0, 255),
          valor,
          // Lançada atrasada (servidor fora do ar), a emissão não pode passar do vencimento.
          dataEmissao: dia < o.vencimento ? dia : o.vencimento,
          primeiroVencimento: o.vencimento,
          parcelas: 1,
          planoContaId: d.planoContaId,
          centroCustoId: d.centroCustoId,
          origem: { despesaRecorrenteId: d.id, competenciaRecorrente: o.competencia, estimada: estimado },
        }),
      );
    } catch (erro) {
      // Outra instância (ou um clique duplo) lançou a mesma conta primeiro.
      if (erro instanceof QueryFailedError && (erro as unknown as { code?: string }).code === '23505') return false;
      if (automatica) {
        this.logger.error(`Falha ao lançar a despesa ${d.id} de ${o.competencia}`, erro as Error);
        return false;
      }
      throw erro;
    }
    if (automatica) {
      await this.auditoria.registrar({
        acao: 'POST /api/despesas-recorrentes/lancamentos (agendador)',
        empresaId,
        recurso: 'despesas-recorrentes',
        recursoId: d.id,
        dados: { competencia: o.competencia, vencimento: o.vencimento, valor, estimado, base },
      });
    }
    return true;
  }

  private valores(tipo: TipoValorDespesa, d: { valor?: number | null; percentual?: number | null }) {
    return tipo === TipoValorDespesa.PERCENTUAL_FATURAMENTO ? { valor: null, percentual: d.percentual ?? null } : { valor: d.valor ?? null, percentual: null };
  }

  private async validar(
    empresaId: string,
    d: { fornecedorId: string; tipoValor: TipoValorDespesa; valor?: number | null; percentual?: number | null; inicio: string; fim?: string | null; planoContaId?: string | null; centroCustoId?: string | null },
  ) {
    await this.fornecedores.findOne(empresaId, d.fornecedorId);
    if (d.planoContaId) await this.planoContas.findParaLancamento(empresaId, d.planoContaId, TipoPlanoConta.DESPESA);
    if (d.centroCustoId) await this.centrosCusto.findAtivo(empresaId, d.centroCustoId);
    if (d.fim && d.fim < d.inicio) throw new BadRequestException('O fim não pode ser antes do início');
    if (d.tipoValor === TipoValorDespesa.PERCENTUAL_FATURAMENTO) {
      if (!d.percentual) throw new BadRequestException('Informe o percentual sobre o faturamento (ex.: a alíquota efetiva do DAS)');
    } else if (!d.valor) {
      throw new BadRequestException(d.tipoValor === TipoValorDespesa.ESTIMADO ? 'Informe um valor estimado para os primeiros meses' : 'Informe o valor da despesa');
    }
  }
}

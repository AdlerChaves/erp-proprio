import { BadRequestException, ConflictException, HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, In, Not, Repository } from 'typeorm';
import { hoje } from '../../common/datas';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { NotaServico, StatusNotaServico } from '../nfse/nota-servico.entity';
import { NfseService } from '../nfse/nfse.service';
import { StatusVenda, Venda } from '../vendas/venda.entity';
import { VendasService } from '../vendas/vendas.service';
import { Contrato, GeracaoContrato, ItemContrato, SituacaoContrato, SituacaoGeracao } from './contrato.entity';
import { mesAno } from './contratos.service';

/** Geração parada em PROCESSANDO há mais que isto foi interrompida (queda do servidor) e pode ser retomada. */
const MINUTOS_TRAVA = 10;

export const competenciaDe = (data: string) => data.slice(0, 7);
const noMes = (competencia: string, dia: number) => `${competencia}-${String(dia).padStart(2, '0')}`;
export function mesSeguinte(competencia: string, meses = 1) {
  const [ano, mes] = competencia.split('-').map(Number);
  const total = ano * 12 + (mes - 1) + meses;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Faturamento no dia combinado; o vencimento, no mesmo mês ou, se o dia dele vem antes, no seguinte. */
export function datasDaCompetencia(contrato: Pick<Contrato, 'diaFaturamento' | 'diaVencimento'>, competencia: string) {
  const faturamento = noMes(competencia, contrato.diaFaturamento);
  const mesVencimento = contrato.diaVencimento >= contrato.diaFaturamento ? competencia : mesSeguinte(competencia);
  return { faturamento, vencimento: noMes(mesVencimento, contrato.diaVencimento) };
}

/** Situação de um contrato no mês, para a tela; é derivada da geração, da venda e das notas. */
export type EstadoMes =
  | 'AGENDADA'
  | 'A_GERAR'
  | 'PAUSADO'
  | 'PROCESSANDO'
  | 'FALHA'
  | 'NOTA_PENDENTE'
  | 'VENDA_CANCELADA'
  | 'CONCLUIDA';

const ETAPAS = { venda: 'Venda', faturamento: 'Faturamento', nfse: 'Nota de serviço' } as const;

@Injectable()
export class GeracaoContratosService {
  private readonly logger = new Logger(GeracaoContratosService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Contrato) private readonly contratos: Repository<Contrato>,
    @InjectRepository(GeracaoContrato) private readonly geracoes: Repository<GeracaoContrato>,
    @InjectRepository(ItemContrato) private readonly itensContrato: Repository<ItemContrato>,
    @InjectRepository(Venda) private readonly vendasRepo: Repository<Venda>,
    @InjectRepository(NotaServico) private readonly notas: Repository<NotaServico>,
    private readonly vendas: VendasService,
    private readonly nfse: NfseService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Contratos com vigência na competência (ativos, ou que já têm cobrança nela) e a situação de cada um. */
  async mes(empresaId: string, competencia: string) {
    const contratos = await this.contratos
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.cliente', 'cliente')
      .where('c.empresa_id = :empresaId AND c.inicio <= :competencia', { empresaId, competencia })
      .andWhere('(c.fim IS NULL OR c.fim >= :competencia)', { competencia })
      .andWhere(
        new Brackets((q) =>
          q
            .where('c.situacao = :ativo', { ativo: SituacaoContrato.ATIVO })
            .orWhere('EXISTS (SELECT 1 FROM geracoes_contrato g WHERE g.contrato_id = c.id AND g.competencia = :competencia)'),
        ),
      )
      .orderBy('c.dia_faturamento', 'ASC')
      .addOrderBy('c.numero', 'ASC')
      .getMany();
    const ids = contratos.map((c) => c.id);
    const geracoes = ids.length ? await this.geracoes.find({ where: { contratoId: In(ids), competencia }, relations: { venda: true } }) : [];
    const porContrato = new Map(geracoes.map((g) => [g.contratoId, g]));
    const vendaIds = geracoes.flatMap((g) => (g.vendaId ? [g.vendaId] : []));
    const notas = vendaIds.length
      ? await this.notas.find({
          where: { vendaId: In(vendaIds), status: Not(StatusNotaServico.CANCELADA) },
          select: { id: true, vendaId: true, status: true, numeroDps: true, numeroNfse: true, erroTransmissao: true },
          order: { numeroDps: 'ASC' },
        })
      : [];
    const dia = hoje();

    const itens = contratos.map((c) => {
      const geracao = porContrato.get(c.id) ?? null;
      const venda = geracao?.venda ?? null;
      const notasDaVenda = notas.filter((n) => n.vendaId === venda?.id);
      const datas = datasDaCompetencia(c, competencia);
      let estado: EstadoMes;
      if (!geracao) {
        estado = c.situacao !== SituacaoContrato.ATIVO ? 'PAUSADO' : datas.faturamento > dia ? 'AGENDADA' : 'A_GERAR';
      } else if (geracao.situacao === SituacaoGeracao.CONCLUIDA) {
        estado =
          venda?.status === StatusVenda.CANCELADA
            ? 'VENDA_CANCELADA'
            : notasDaVenda.some((n) => n.status === StatusNotaServico.PENDENTE)
              ? 'NOTA_PENDENTE'
              : 'CONCLUIDA';
      } else {
        estado = geracao.situacao;
      }
      return {
        contrato: {
          id: c.id,
          numero: c.numero,
          descricao: c.descricao,
          situacao: c.situacao,
          valor: c.valor,
          emitirNfse: c.emitirNfse,
          transmitirNfse: c.transmitirNfse,
          cliente: { id: c.cliente.id, nome: c.cliente.nome },
        },
        ...datas,
        estado,
        geracao: geracao && {
          id: geracao.id,
          situacao: geracao.situacao,
          erro: geracao.erro,
          automatica: geracao.automatica,
          atualizadoEm: geracao.atualizadoEm,
        },
        venda: venda && { id: venda.id, numero: venda.numero, status: venda.status, total: venda.total },
        notas: notasDaVenda.map(({ vendaId: _, ...n }) => n),
      };
    });
    const total = (estados: EstadoMes[]) => itens.filter((i) => estados.includes(i.estado)).reduce((s, i) => s + Math.round(i.contrato.valor * 100), 0) / 100;
    return {
      competencia,
      itens,
      resumo: {
        contratos: itens.length,
        gerado: total(['CONCLUIDA', 'NOTA_PENDENTE']),
        aGerar: total(['AGENDADA', 'A_GERAR', 'FALHA', 'PROCESSANDO']),
        pendencias: itens.filter((i) => ['A_GERAR', 'FALHA', 'NOTA_PENDENTE', 'VENDA_CANCELADA'].includes(i.estado)).length,
      },
    };
  }

  /**
   * Gera (ou retoma) a cobrança de um contrato numa competência: venda, faturamento (que lança a conta a receber),
   * DPS e transmissão da NFS-e, conforme o contrato. Chamar de novo é seguro: o que já foi feito não se repete.
   * Devolve a geração, ou null se não havia nada a fazer.
   */
  async gerar(empresaId: string, contratoId: string, competencia: string, automatica = false) {
    if (competencia > competenciaDe(hoje())) throw new BadRequestException('Não dá para gerar a cobrança de um mês futuro');
    const preparada = await this.dataSource.transaction(async (m) => {
      // Trava o contrato: duas gerações do mesmo contrato não correm ao mesmo tempo.
      const contrato = await m.findOne(Contrato, { where: { id: contratoId, empresaId }, lock: { mode: 'pessimistic_write' } });
      if (!contrato) throw new NotFoundException(`Contrato ${contratoId} não encontrado`);
      let geracao = await m.findOneBy(GeracaoContrato, { contratoId, competencia });

      if (geracao?.situacao === SituacaoGeracao.CONCLUIDA) {
        const venda = geracao.vendaId ? await m.findOneBy(Venda, { id: geracao.vendaId }) : null;
        // Só gera de novo se alguém cancelou a venda do mês.
        if (venda && venda.status !== StatusVenda.CANCELADA) return null;
      }
      if (geracao?.situacao === SituacaoGeracao.PROCESSANDO && Date.now() - geracao.atualizadoEm.getTime() < MINUTOS_TRAVA * 60_000) {
        if (automatica) return null;
        throw new ConflictException('A cobrança deste mês já está sendo gerada; aguarde alguns instantes');
      }
      if (contrato.situacao !== SituacaoContrato.ATIVO) {
        throw new BadRequestException(`O contrato nº ${contrato.numero} está ${contrato.situacao === SituacaoContrato.PAUSADO ? 'pausado' : 'encerrado'}`);
      }
      if (competencia < contrato.inicio || (contrato.fim && competencia > contrato.fim)) {
        throw new BadRequestException(`${mesAno(competencia)} está fora da vigência do contrato nº ${contrato.numero}`);
      }
      geracao ??= m.create(GeracaoContrato, { empresaId, contratoId, competencia });
      Object.assign(geracao, { situacao: SituacaoGeracao.PROCESSANDO, erro: null, automatica });
      return { contrato, geracao: await m.save(geracao) };
    });
    if (!preparada) return null;
    const geracao = await this.processar(empresaId, preparada.contrato, preparada.geracao);
    if (automatica) {
      await this.auditoria.registrar({
        acao: 'POST /api/contratos/geracoes (agendador)',
        empresaId,
        recurso: 'contratos',
        recursoId: contratoId,
        dados: { competencia, situacao: geracao.situacao, vendaId: geracao.vendaId, erro: geracao.erro },
      });
    }
    return geracao;
  }

  /**
   * Gera as cobranças em aberto da competência. Pelo agendador, só as que já chegaram ao dia do faturamento e
   * sem repetir as que falharam (a pessoa corrige e tenta de novo); à mão, todas, inclusive antecipando o mês.
   */
  async gerarPendentes(empresaId: string, competencia: string, opcoes: { automatica: boolean; hoje?: string }) {
    const dia = opcoes.hoje ?? hoje();
    const { itens } = await this.mes(empresaId, competencia);
    const candidatos = itens.filter((i) => {
      if (i.contrato.situacao !== SituacaoContrato.ATIVO) return false;
      if (opcoes.automatica) return (i.estado === 'A_GERAR' || i.estado === 'AGENDADA') && i.faturamento <= dia;
      return ['AGENDADA', 'A_GERAR', 'FALHA', 'VENDA_CANCELADA'].includes(i.estado);
    });
    let geradas = 0;
    let falhas = 0;
    for (const item of candidatos) {
      try {
        const geracao = await this.gerar(empresaId, item.contrato.id, competencia, opcoes.automatica);
        if (geracao?.situacao === SituacaoGeracao.CONCLUIDA) geradas++;
        else if (geracao) falhas++;
      } catch (erro) {
        // Contrato alterado no meio do caminho (pausado, por exemplo): segue com os outros.
        if (!(erro instanceof HttpException)) throw erro;
        falhas++;
      }
    }
    return { geradas, falhas };
  }

  /** Executa as etapas que faltam e grava o resultado; erro em qualquer etapa vira FALHA com a mensagem. */
  private async processar(empresaId: string, contrato: Contrato, geracao: GeracaoContrato) {
    const { competencia } = geracao;
    const { faturamento, vencimento } = datasDaCompetencia(contrato, competencia);
    // Gerada antes do dia combinado (antecipada à mão), fatura hoje: nada fiscal pode ter data futura.
    const data = faturamento > hoje() ? hoje() : faturamento;
    let etapa: keyof typeof ETAPAS = 'venda';
    try {
      let venda = geracao.vendaId ? await this.vendasRepo.findOneBy({ id: geracao.vendaId }) : null;
      if (!venda || venda.status === StatusVenda.CANCELADA) {
        // A venda pode ter sido criada numa tentativa que caiu antes de gravar a geração.
        venda = await this.vendasRepo.findOneBy({ contratoId: contrato.id, competenciaContrato: competencia, status: Not(StatusVenda.CANCELADA) });
      }
      if (!venda) {
        const itens = await this.itensContrato.find({ where: { contratoId: contrato.id }, order: { ordem: 'ASC' } });
        const observacoes = [`Contrato nº ${contrato.numero} - ${contrato.descricao} - referente a ${mesAno(competencia)}`, contrato.observacoes]
          .filter(Boolean)
          .join('\n')
          .slice(0, 500);
        venda = await this.vendas.create(
          empresaId,
          {
            clienteId: contrato.clienteId,
            status: StatusVenda.PEDIDO,
            dataEmissao: data,
            primeiroVencimento: vencimento,
            planoContaId: contrato.planoContaId ?? undefined,
            centroCustoId: contrato.centroCustoId ?? undefined,
            observacoes,
            exibirParcelamento: false,
            itens: itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade, precoUnitario: i.precoUnitario, desconto: i.desconto })),
          },
          { contratoId: contrato.id, competencia },
        );
      }
      await this.geracoes.update(geracao.id, { vendaId: venda.id });

      etapa = 'faturamento';
      if (venda.status === StatusVenda.PEDIDO) await this.vendas.faturar(empresaId, venda.id, { data });

      etapa = 'nfse';
      if (contrato.emitirNfse) {
        let notas = await this.notas.findBy({ vendaId: venda.id, status: Not(StatusNotaServico.CANCELADA) });
        if (!notas.length) notas = await this.nfse.gerarParaVenda(empresaId, venda.id, {});
        if (contrato.transmitirNfse) {
          for (const nota of notas.filter((n) => n.status === StatusNotaServico.PENDENTE)) {
            // Recusa ou falta de resposta ficam gravadas na própria nota, que pode ser transmitida de novo depois.
            await this.nfse.transmitir(empresaId, nota.id).catch((erro: Error) => {
              if (!(erro instanceof HttpException)) throw erro;
            });
          }
        }
      }
      await this.geracoes.update(geracao.id, { situacao: SituacaoGeracao.CONCLUIDA, erro: null });
    } catch (erro) {
      if (!(erro instanceof HttpException)) this.logger.error(`Falha ao gerar o contrato ${contrato.id} em ${competencia}`, erro as Error);
      const mensagem = erro instanceof HttpException ? erro.message : 'Erro interno; tente de novo';
      await this.geracoes.update(geracao.id, { situacao: SituacaoGeracao.FALHA, erro: `${ETAPAS[etapa]}: ${mensagem}`.slice(0, 1000) });
    }
    return this.geracoes.findOneByOrFail({ id: geracao.id });
  }
}

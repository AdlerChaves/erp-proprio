import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { hoje } from '../../common/datas';
import { centavos, reais } from '../../common/dinheiro';
import { CentrosCustoService } from '../centros-custo/centros-custo.service';
import { ContaPagar } from '../contas-pagar/conta-pagar.entity';
import { ContasBancariasService } from '../contas-bancarias/contas-bancarias.service';
import { Baixa } from '../financeiro/baixa.entity';
import { dividirEmParcelas } from '../financeiro/contas-financeiras.service';
import { StatusConta } from '../financeiro/status-conta.enum';
import { FornecedoresService } from '../fornecedores/fornecedores.service';
import { TipoPlanoConta } from '../plano-contas/plano-conta.entity';
import { PlanoContasService } from '../plano-contas/plano-contas.service';
import { competenciaDaCompra, datasPadrao, somarCompetencia } from './calendario';
import { CartaoCredito } from './cartao-credito.entity';
import { AlterarDatasFaturaDto } from './dto/alterar-datas.dto';
import { CreateCartaoDto } from './dto/create-cartao.dto';
import { CreateLancamentoCartaoDto } from './dto/create-lancamento.dto';
import { UpdateCartaoDto } from './dto/update-cartao.dto';
import { UpdateLancamentoCartaoDto } from './dto/update-lancamento.dto';
import { FaturaCartao, StatusFatura } from './fatura-cartao.entity';
import { LancamentoCartao, TipoLancamentoCartao } from './lancamento-cartao.entity';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** "2026-11" → "nov/2026". */
const mesAno = (competencia: string) => `${MESES[Number(competencia.slice(5, 7)) - 1]}/${competencia.slice(0, 4)}`;

/** Compras menos estornos, em centavos. */
const totalDe = (lancamentos: Pick<LancamentoCartao, 'tipo' | 'valor'>[]) =>
  lancamentos.reduce((s, l) => s + (l.tipo === TipoLancamentoCartao.ESTORNO ? -1 : 1) * centavos(l.valor), 0);

/** Faturas já gravadas de um cartão, por competência; as que não existem usam as datas padrão. */
class Calendario {
  constructor(
    private readonly cartao: CartaoCredito,
    readonly faturas: Map<string, FaturaCartao>,
  ) {}

  datas(competencia: string) {
    const gravada = this.faturas.get(competencia);
    return gravada ?? datasPadrao(this.cartao, competencia);
  }

  fechamento = (competencia: string) => this.datas(competencia).dataFechamento;

  status(competencia: string) {
    return this.faturas.get(competencia)?.status ?? StatusFatura.ABERTA;
  }
}

@Injectable()
export class CartoesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(CartaoCredito) private readonly repo: Repository<CartaoCredito>,
    @InjectRepository(FaturaCartao) private readonly faturas: Repository<FaturaCartao>,
    @InjectRepository(LancamentoCartao) private readonly lancamentos: Repository<LancamentoCartao>,
    private readonly contasBancarias: ContasBancariasService,
    private readonly fornecedores: FornecedoresService,
    private readonly planoContas: PlanoContasService,
    private readonly centrosCusto: CentrosCustoService,
  ) {}

  // ---------- Cartões ----------

  /** Cartões com o total usado do limite e a fatura atual (a que recebe as compras de hoje). */
  async findAll(empresaId: string) {
    const cartoes = await this.repo.find({ where: { empresaId }, relations: { contaBancaria: true, fornecedor: true }, order: { nome: 'ASC' } });
    return Promise.all(cartoes.map(async (c) => ({ ...c, ...(await this.resumo(c)) })));
  }

  async findOne(empresaId: string, id: string) {
    const cartao = await this.repo.findOne({ where: { id, empresaId }, relations: { contaBancaria: true, fornecedor: true } });
    if (!cartao) throw new NotFoundException(`Cartão ${id} não encontrado`);
    return { ...cartao, ...(await this.resumo(cartao)) };
  }

  async create(empresaId: string, dto: CreateCartaoDto) {
    await this.validarVinculos(empresaId, dto);
    await this.nomeLivre(empresaId, dto.nome);
    const { id } = await this.repo.save(this.repo.create({ ...dto, nome: dto.nome.trim(), empresaId }));
    return this.findOne(empresaId, id);
  }

  async update(empresaId: string, id: string, dto: UpdateCartaoDto) {
    await this.validarVinculos(empresaId, dto);
    await this.dataSource.transaction(async (m) => {
      const cartao = await this.travar(m, empresaId, id);
      if (dto.nome && dto.nome.trim() !== cartao.nome) await this.nomeLivre(empresaId, dto.nome);
      const mudouDias =
        (dto.diaFechamento !== undefined && dto.diaFechamento !== cartao.diaFechamento) ||
        (dto.diaVencimento !== undefined && dto.diaVencimento !== cartao.diaVencimento);
      Object.assign(cartao, { ...dto, nome: dto.nome?.trim() ?? cartao.nome });
      await m.save(cartao);
      if (mudouDias) {
        // Faturas abertas sem ajuste manual passam a usar os novos dias; as compras são redistribuídas.
        const abertas = await m.find(FaturaCartao, { where: { cartaoId: id, status: StatusFatura.ABERTA, datasAjustadas: false } });
        for (const f of abertas) await m.update(FaturaCartao, f.id, datasPadrao(cartao, f.competencia));
        await this.reorganizar(m, cartao);
      }
    });
    return this.findOne(empresaId, id);
  }

  async remove(empresaId: string, id: string) {
    await this.dataSource.transaction(async (m) => {
      await this.travar(m, empresaId, id);
      if (await m.existsBy(LancamentoCartao, { cartaoId: id })) {
        throw new ConflictException('O cartão tem lançamentos; desative-o em vez de remover');
      }
      await m.delete(FaturaCartao, { cartaoId: id });
      await m.delete(CartaoCredito, { id });
    });
  }

  // ---------- Faturas ----------

  /** Fatura de uma competência com os lançamentos, o total e a conta a pagar. Se ainda não existe, vem com as datas padrão. */
  async fatura(empresaId: string, cartaoId: string, competencia: string) {
    const cartao = await this.findEntidade(empresaId, cartaoId);
    const calendario = await this.calendario(this.dataSource.manager, cartao);
    const gravada = calendario.faturas.get(competencia);
    const lancamentos = gravada
      ? await this.lancamentos.find({
          where: { faturaId: gravada.id },
          relations: { planoConta: true, centroCusto: true, fornecedor: true },
          order: { data: 'ASC', seq: 'ASC' } as never,
        })
      : [];
    const conta = gravada ? await this.dataSource.getRepository(ContaPagar).findOneBy({ faturaCartaoId: gravada.id }) : null;
    const pago = conta ? await this.principalPago(this.dataSource.manager, conta.id) : 0;
    const { dataFechamento, dataVencimento } = calendario.datas(competencia);
    return {
      id: gravada?.id ?? null,
      competencia,
      dataFechamento,
      dataVencimento,
      /** Compras a partir desta data (inclusive) entram nesta fatura. */
      inicioPeriodo: calendario.fechamento(somarCompetencia(competencia, -1)),
      datasAjustadas: gravada?.datasAjustadas ?? false,
      status: calendario.status(competencia),
      total: reais(totalDe(lancamentos)),
      pago: reais(pago),
      contaPagar: conta ? { id: conta.id, status: conta.status, valor: conta.valor } : null,
      lancamentos,
    };
  }

  /** Ajusta as datas de uma fatura aberta e redistribui as compras pelo novo fechamento. */
  async alterarDatas(empresaId: string, cartaoId: string, competencia: string, dto: AlterarDatasFaturaDto) {
    await this.dataSource.transaction(async (m) => {
      const cartao = await this.travar(m, empresaId, cartaoId);
      const calendario = await this.calendario(m, cartao);
      if (calendario.status(competencia) !== StatusFatura.ABERTA) {
        throw new BadRequestException(`A fatura de ${mesAno(competencia)} está fechada; reabra-a para mudar as datas`);
      }
      const atual = calendario.datas(competencia);
      const dataFechamento = dto.dataFechamento ?? atual.dataFechamento;
      const dataVencimento = dto.dataVencimento ?? atual.dataVencimento;
      const anterior = calendario.datas(somarCompetencia(competencia, -1));
      const seguinte = calendario.datas(somarCompetencia(competencia, 1));
      if (dataVencimento < dataFechamento) throw new BadRequestException('O vencimento não pode ser antes do fechamento');
      if (dataFechamento <= anterior.dataFechamento || dataFechamento >= seguinte.dataFechamento) {
        throw new BadRequestException(
          `O fechamento precisa ficar entre o da fatura anterior (${anterior.dataFechamento}) e o da seguinte (${seguinte.dataFechamento})`,
        );
      }
      if (dataVencimento <= anterior.dataVencimento || dataVencimento >= seguinte.dataVencimento) {
        throw new BadRequestException(
          `O vencimento precisa ficar entre o da fatura anterior (${anterior.dataVencimento}) e o da seguinte (${seguinte.dataVencimento})`,
        );
      }
      const fatura = await this.garantirFatura(m, cartao, calendario, competencia);
      await m.update(FaturaCartao, fatura.id, { dataFechamento, dataVencimento, datasAjustadas: true });
      await this.reorganizar(m, cartao);
    });
    return this.fatura(empresaId, cartaoId, competencia);
  }

  /** Conferida com o banco: a fatura não muda mais. */
  async fechar(empresaId: string, cartaoId: string, competencia: string) {
    await this.dataSource.transaction(async (m) => {
      const cartao = await this.travar(m, empresaId, cartaoId);
      const calendario = await this.calendario(m, cartao);
      if (calendario.status(competencia) === StatusFatura.FECHADA) throw new BadRequestException('A fatura já está fechada');
      const fatura = await this.garantirFatura(m, cartao, calendario, competencia);
      await m.update(FaturaCartao, fatura.id, { status: StatusFatura.FECHADA });
    });
    return this.fatura(empresaId, cartaoId, competencia);
  }

  async reabrir(empresaId: string, cartaoId: string, competencia: string) {
    await this.dataSource.transaction(async (m) => {
      const cartao = await this.travar(m, empresaId, cartaoId);
      const fatura = await m.findOneBy(FaturaCartao, { cartaoId: cartao.id, competencia });
      if (!fatura || fatura.status !== StatusFatura.FECHADA) throw new BadRequestException('A fatura não está fechada');
      const conta = await m.findOneBy(ContaPagar, { faturaCartaoId: fatura.id });
      if (conta && (await this.principalPago(m, conta.id)) > 0) {
        throw new BadRequestException('A fatura já tem pagamento registrado; estorne o pagamento antes de reabrir');
      }
      await m.update(FaturaCartao, fatura.id, { status: StatusFatura.ABERTA });
    });
    return this.fatura(empresaId, cartaoId, competencia);
  }

  // ---------- Lançamentos ----------

  /** Lança a compra (ou estorno) na fatura da data dela; parcelada, uma parcela em cada fatura seguinte. */
  async lancar(empresaId: string, cartaoId: string, dto: CreateLancamentoCartaoDto) {
    const parcelas = dto.parcelas ?? 1;
    if (dto.tipo === TipoLancamentoCartao.ESTORNO && parcelas > 1) throw new BadRequestException('Estorno não é parcelado');
    if (centavos(dto.valor) < parcelas) throw new BadRequestException('O valor não cobre um centavo por parcela');
    await this.validarClassificacao(empresaId, dto);

    const ids = await this.dataSource.transaction(async (m) => {
      const cartao = await this.travar(m, empresaId, cartaoId);
      if (!cartao.ativo) throw new BadRequestException(`O cartão ${cartao.nome} está inativo`);
      const calendario = await this.calendario(m, cartao);
      const primeira = competenciaDaCompra(dto.data, calendario.fechamento);
      const compraId = randomUUID();
      const criados: string[] = [];
      for (const [i, valor] of dividirEmParcelas(dto.valor, parcelas).entries()) {
        const competencia = somarCompetencia(primeira, i);
        if (calendario.status(competencia) === StatusFatura.FECHADA) {
          throw new BadRequestException(`A fatura de ${mesAno(competencia)} está fechada; reabra-a para lançar nela`);
        }
        const fatura = await this.garantirFatura(m, cartao, calendario, competencia);
        const lancamento = await m.save(
          m.create(LancamentoCartao, {
            empresaId,
            cartaoId,
            faturaId: fatura.id,
            compraId,
            data: dto.data,
            descricao: dto.descricao.trim(),
            tipo: dto.tipo ?? TipoLancamentoCartao.COMPRA,
            valor,
            parcela: parcelas > 1 ? i + 1 : null,
            totalParcelas: parcelas > 1 ? parcelas : null,
            planoContaId: dto.planoContaId ?? null,
            centroCustoId: dto.centroCustoId ?? null,
            fornecedorId: dto.fornecedorId ?? null,
          }),
        );
        criados.push(lancamento.id);
      }
      await this.sincronizarContas(m, cartao);
      return criados;
    });
    return this.lancamentos.find({
      where: { id: In(ids) },
      relations: { fatura: true },
      order: { parcela: 'ASC' },
    });
  }

  /** Descrição e classificação de todas as parcelas da compra. */
  async alterarLancamento(empresaId: string, cartaoId: string, id: string, dto: UpdateLancamentoCartaoDto) {
    const lancamento = await this.lancamentoDe(empresaId, cartaoId, id);
    await this.validarClassificacao(empresaId, dto);
    const alteracoes = { ...dto, ...(dto.descricao && { descricao: dto.descricao.trim() }) };
    if (Object.keys(alteracoes).length) await this.lancamentos.update({ compraId: lancamento.compraId }, alteracoes);
    return this.lancamentos.find({ where: { compraId: lancamento.compraId }, relations: { fatura: true }, order: { parcela: 'ASC' } });
  }

  /** Exclui a compra inteira (todas as parcelas), desde que nenhuma esteja em fatura fechada. */
  async excluirLancamento(empresaId: string, cartaoId: string, id: string) {
    const { compraId } = await this.lancamentoDe(empresaId, cartaoId, id);
    await this.dataSource.transaction(async (m) => {
      const cartao = await this.travar(m, empresaId, cartaoId);
      const parcelas = await m.find(LancamentoCartao, { where: { compraId }, relations: { fatura: true } });
      const fechada = parcelas.find((p) => p.fatura.status === StatusFatura.FECHADA);
      if (fechada) {
        throw new BadRequestException(`Uma parcela está na fatura de ${mesAno(fechada.fatura.competencia)}, que já foi fechada`);
      }
      await m.delete(LancamentoCartao, { compraId });
      await this.sincronizarContas(m, cartao);
    });
  }

  // ---------- Regras internas ----------

  /**
   * Recalcula a fatura de cada compra pelas datas atuais (depois de mudar um fechamento) e ajusta as contas a pagar.
   * Só lançamentos de faturas abertas mudam de lugar; nenhum pode entrar numa fatura fechada.
   */
  private async reorganizar(m: EntityManager, cartao: CartaoCredito) {
    const calendario = await this.calendario(m, cartao);
    const porId = new Map([...calendario.faturas.values()].map((f) => [f.id, f]));
    const lancamentos = await m.find(LancamentoCartao, { where: { cartaoId: cartao.id } });
    const compras = new Map<string, LancamentoCartao[]>();
    for (const l of lancamentos) compras.set(l.compraId, [...(compras.get(l.compraId) ?? []), l]);

    for (const parcelas of compras.values()) {
      if (parcelas.every((p) => porId.get(p.faturaId)!.status === StatusFatura.FECHADA)) continue;
      // A primeira parcela fica onde está se a fatura dela já fechou; senão, volta a seguir a data da compra.
      const primeiraParcela = parcelas.find((p) => (p.parcela ?? 1) === 1)!;
      const faturaPrimeira = porId.get(primeiraParcela.faturaId)!;
      const ancora =
        faturaPrimeira.status === StatusFatura.FECHADA
          ? faturaPrimeira.competencia
          : competenciaDaCompra(primeiraParcela.data, calendario.fechamento);
      for (const p of parcelas) {
        const atual = porId.get(p.faturaId)!;
        const destino = somarCompetencia(ancora, (p.parcela ?? 1) - 1);
        if (atual.competencia === destino) continue;
        if (atual.status === StatusFatura.FECHADA || calendario.status(destino) === StatusFatura.FECHADA) {
          throw new BadRequestException(
            `A mudança levaria "${p.descricao}" de ${mesAno(atual.competencia)} para ${mesAno(destino)}, e uma delas está fechada`,
          );
        }
        const fatura = await this.garantirFatura(m, cartao, calendario, destino);
        porId.set(fatura.id, fatura);
        await m.update(LancamentoCartao, p.id, { faturaId: fatura.id });
      }
    }
    await this.sincronizarContas(m, cartao);
  }

  /**
   * Mantém uma conta a pagar por fatura aberta com saldo: valor = compras − estornos, vencimento = o da fatura.
   * Fatura zerada (ou só com estornos) não tem conta. Conta com pagamento não muda.
   */
  private async sincronizarContas(m: EntityManager, cartao: CartaoCredito) {
    const faturas = await m.find(FaturaCartao, { where: { cartaoId: cartao.id } });
    const lancamentos = await m.find(LancamentoCartao, { where: { cartaoId: cartao.id } });
    const contas = await m.find(ContaPagar, { where: { faturaCartaoId: In(faturas.map((f) => f.id)) } });
    for (const fatura of faturas) {
      const total = totalDe(lancamentos.filter((l) => l.faturaId === fatura.id));
      const conta = contas.find((c) => c.faturaCartaoId === fatura.id);
      const descricao = `Fatura ${cartao.nome} ${mesAno(fatura.competencia)}`.slice(0, 255);
      const desejado = { valor: reais(total), dataVencimento: fatura.dataVencimento, dataEmissao: fatura.dataFechamento };
      const igual =
        conta &&
        centavos(conta.valor) === total &&
        conta.dataVencimento === desejado.dataVencimento &&
        conta.dataEmissao === desejado.dataEmissao &&
        conta.descricao === descricao;
      if (igual || (!conta && total <= 0)) continue;

      if (conta && (await this.principalPago(m, conta.id)) > 0) {
        throw new BadRequestException(
          `A fatura de ${mesAno(fatura.competencia)} já tem pagamento registrado; estorne o pagamento antes de alterá-la`,
        );
      }
      if (total <= 0) {
        await m.delete(ContaPagar, { id: conta!.id });
      } else if (conta) {
        await m.update(ContaPagar, conta.id, { ...desejado, descricao, status: StatusConta.ABERTA });
      } else {
        await m.save(
          m.create(ContaPagar, {
            ...desejado,
            empresaId: cartao.empresaId,
            fornecedorId: cartao.fornecedorId,
            descricao,
            faturaCartaoId: fatura.id,
          }),
        );
      }
    }
  }

  private async garantirFatura(m: EntityManager, cartao: CartaoCredito, calendario: Calendario, competencia: string) {
    const existente = calendario.faturas.get(competencia);
    if (existente) return existente;
    const fatura = await m.save(
      m.create(FaturaCartao, { empresaId: cartao.empresaId, cartaoId: cartao.id, competencia, ...datasPadrao(cartao, competencia) }),
    );
    calendario.faturas.set(competencia, fatura);
    return fatura;
  }

  private async calendario(m: EntityManager, cartao: CartaoCredito) {
    const faturas = await m.find(FaturaCartao, { where: { cartaoId: cartao.id } });
    return new Calendario(cartao, new Map(faturas.map((f) => [f.competencia, f])));
  }

  /** Limite usado (o que ainda não foi pago das faturas) e a competência que recebe as compras de hoje. */
  private async resumo(cartao: CartaoCredito) {
    const calendario = await this.calendario(this.dataSource.manager, cartao);
    const [{ usado }]: { usado: string | null }[] = await this.dataSource.query(
      `SELECT SUM(CASE WHEN l.tipo = 'ESTORNO' THEN -l.valor ELSE l.valor END)
            - COALESCE((SELECT SUM(b.valor) FROM baixas b JOIN contas_pagar c ON c.id = b.conta_pagar_id
                         JOIN faturas_cartao f ON f.id = c.fatura_cartao_id WHERE f.cartao_id = $1), 0) AS usado
         FROM lancamentos_cartao l WHERE l.cartao_id = $1`,
      [cartao.id],
    );
    const usadoCentavos = Math.max(0, centavos(usado ?? 0));
    return {
      faturaAtual: competenciaDaCompra(hoje(), calendario.fechamento),
      limiteUsado: reais(usadoCentavos),
      limiteDisponivel: cartao.limite === null ? null : reais(centavos(cartao.limite) - usadoCentavos),
    };
  }

  private async principalPago(m: EntityManager, contaPagarId: string) {
    const baixas = await m.find(Baixa, { where: { contaPagarId } });
    return baixas.reduce((s, b) => s + centavos(b.valor), 0);
  }

  private async lancamentoDe(empresaId: string, cartaoId: string, id: string) {
    const lancamento = await this.lancamentos.findOneBy({ id, cartaoId, empresaId });
    if (!lancamento) throw new NotFoundException(`Lançamento ${id} não encontrado neste cartão`);
    return lancamento;
  }

  private async findEntidade(empresaId: string, id: string) {
    const cartao = await this.repo.findOneBy({ id, empresaId });
    if (!cartao) throw new NotFoundException(`Cartão ${id} não encontrado`);
    return cartao;
  }

  /** Trava o cartão: lançamentos e ajustes do mesmo cartão acontecem um de cada vez. */
  private async travar(m: EntityManager, empresaId: string, id: string) {
    const cartao = await m.findOne(CartaoCredito, { where: { id, empresaId }, lock: { mode: 'pessimistic_write' } });
    if (!cartao) throw new NotFoundException(`Cartão ${id} não encontrado`);
    return cartao;
  }

  private async validarVinculos(empresaId: string, dto: { contaBancariaId?: string; fornecedorId?: string }) {
    if (dto.contaBancariaId) await this.contasBancarias.findAtiva(empresaId, dto.contaBancariaId);
    if (dto.fornecedorId) await this.fornecedores.findOne(empresaId, dto.fornecedorId);
  }

  private async validarClassificacao(
    empresaId: string,
    dto: { planoContaId?: string | null; centroCustoId?: string | null; fornecedorId?: string | null },
  ) {
    if (dto.planoContaId) await this.planoContas.findParaLancamento(empresaId, dto.planoContaId, TipoPlanoConta.DESPESA);
    if (dto.centroCustoId) await this.centrosCusto.findAtivo(empresaId, dto.centroCustoId);
    if (dto.fornecedorId) await this.fornecedores.findOne(empresaId, dto.fornecedorId);
  }

  private async nomeLivre(empresaId: string, nome: string) {
    if (await this.repo.existsBy({ empresaId, nome: nome.trim() })) throw new ConflictException(`Já existe cartão com o nome ${nome}`);
  }
}

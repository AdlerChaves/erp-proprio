import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, EntityManager, FindOptionsWhere, In, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { hoje } from '../../common/datas';
import { centavos, reais } from '../../common/dinheiro';
import { proximoNumero } from '../../common/numeracao';
import { milesimos, totalItem } from '../../common/quantidade';
import { CentrosCustoService } from '../centros-custo/centros-custo.service';
import { ClientesService } from '../clientes/clientes.service';
import { ContasReceberService } from '../contas-receber/contas-receber.service';
import { EstoqueService } from '../estoque/estoque.service';
import { OrigemMovimentacaoEstoque, TipoMovimentacaoEstoque } from '../estoque/movimentacao-estoque.entity';
import { TipoPlanoConta } from '../plano-contas/plano-conta.entity';
import { NotaServico, StatusNotaServico } from '../nfse/nota-servico.entity';
import { PlanoContasService } from '../plano-contas/plano-contas.service';
import { Produto, TipoProduto } from '../produtos/produto.entity';
import { Perfil } from '../usuarios/perfil.enum';
import { CreateVendaDto, ItemVendaDto } from './dto/create-venda.dto';
import { FaturarVendaDto } from './dto/faturar-venda.dto';
import { FiltroVendasDto } from './dto/filtro-vendas.dto';
import { UpdateVendaDto } from './dto/update-venda.dto';
import { ItemVenda } from './item-venda.entity';
import { StatusVenda, Venda } from './venda.entity';

const EDITAVEIS = [StatusVenda.ORCAMENTO, StatusVenda.PEDIDO];

@Injectable()
export class VendasService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Venda) private readonly repo: Repository<Venda>,
    @InjectRepository(Produto) private readonly produtos: Repository<Produto>,
    private readonly clientes: ClientesService,
    private readonly planoContas: PlanoContasService,
    private readonly centrosCusto: CentrosCustoService,
    private readonly contasReceber: ContasReceberService,
    private readonly estoque: EstoqueService,
  ) {}

  findAll(empresaId: string, filtro: FiltroVendasDto) {
    const where: FindOptionsWhere<Venda> = { empresaId, status: filtro.status, clienteId: filtro.clienteId };
    if (filtro.de && filtro.ate) where.dataEmissao = Between(filtro.de, filtro.ate);
    else if (filtro.de) where.dataEmissao = MoreThanOrEqual(filtro.de);
    else if (filtro.ate) where.dataEmissao = LessThanOrEqual(filtro.ate);
    return this.repo.find({ where, relations: { cliente: true }, order: { numero: 'DESC' } });
  }

  /** A venda com itens, classificação e as contas a receber que ela gerou. */
  async findOne(empresaId: string, id: string) {
    const venda = await this.repo.findOne({
      where: { id, empresaId },
      relations: { cliente: true, planoConta: true, centroCusto: true, itens: { produto: true } },
      order: { itens: { ordem: 'ASC' } },
    });
    if (!venda) throw new NotFoundException(`Venda ${id} não encontrada`);
    return { ...venda, contas: await this.contasReceber.findDaOrigem(empresaId, { vendaId: id }) };
  }

  async create(empresaId: string, dto: CreateVendaDto) {
    await this.validarCliente(empresaId, dto.clienteId);
    await this.validarClassificacao(empresaId, dto);
    const { itens, total } = await this.montarItens(empresaId, dto.itens);
    const { itens: _, ...dados } = dto;

    const id = await this.dataSource.transaction(async (m) => {
      const venda = await m.save(
        m.create(Venda, {
          ...dados,
          empresaId,
          numero: await proximoNumero(m, 'vendas', empresaId),
          status: dto.status ?? StatusVenda.ORCAMENTO,
          dataEmissao: dto.dataEmissao ?? hoje(),
          total,
        }),
      );
      await this.gravarItens(m, venda.id, itens);
      return venda.id;
    });
    return this.findOne(empresaId, id);
  }

  async update(empresaId: string, id: string, dto: UpdateVendaDto) {
    if (dto.clienteId) await this.validarCliente(empresaId, dto.clienteId);
    await this.validarClassificacao(empresaId, dto);
    const montados = dto.itens && (await this.montarItens(empresaId, dto.itens));
    const { itens: _, ...dados } = dto;

    await this.dataSource.transaction(async (m) => {
      const venda = await this.travar(m, empresaId, id);
      if (!EDITAVEIS.includes(venda.status)) {
        throw new BadRequestException(`Venda nº ${venda.numero} está ${venda.status} e não pode ser alterada`);
      }
      if (montados) {
        await m.delete(ItemVenda, { vendaId: id });
        await this.gravarItens(m, id, montados.itens);
      }
      const alteracoes = { ...dados, ...(montados && { total: montados.total }) };
      if (Object.keys(alteracoes).length) await m.update(Venda, id, alteracoes);
    });
    return this.findOne(empresaId, id);
  }

  /** O cliente aprovou o orçamento: vira pedido e passa a reservar estoque. */
  async aprovar(empresaId: string, id: string) {
    await this.dataSource.transaction(async (m) => {
      const venda = await this.travar(m, empresaId, id);
      if (venda.status !== StatusVenda.ORCAMENTO) {
        throw new BadRequestException(`Só orçamentos podem ser aprovados; a venda nº ${venda.numero} está ${venda.status}`);
      }
      await m.update(Venda, id, { status: StatusVenda.PEDIDO });
    });
    return this.findOne(empresaId, id);
  }

  /**
   * Baixa o estoque dos produtos e lança as contas a receber, tudo na mesma transação.
   * Estoque insuficiente não impede o faturamento: a resposta traz avisos.
   */
  async faturar(empresaId: string, id: string, dto: FaturarVendaDto) {
    const avisos = await this.dataSource.transaction(async (m) => {
      const venda = await this.travar(m, empresaId, id);
      if (venda.status !== StatusVenda.PEDIDO) {
        throw new BadRequestException(
          venda.status === StatusVenda.ORCAMENTO
            ? `A venda nº ${venda.numero} ainda é orçamento; aprove-a antes de faturar`
            : `A venda nº ${venda.numero} está ${venda.status} e não pode ser faturada`,
        );
      }
      if (venda.total <= 0) throw new BadRequestException('Uma venda de valor zero não gera contas a receber');
      const data = dto.data ?? hoje();
      if (data < venda.dataEmissao) throw new BadRequestException('O faturamento não pode ser antes da emissão da venda');
      const primeiroVencimento = venda.primeiroVencimento ?? data;
      if (primeiroVencimento < data) {
        throw new BadRequestException('O primeiro vencimento não pode ser antes do faturamento');
      }
      await this.validarCliente(empresaId, venda.clienteId);

      const itens = await m.find(ItemVenda, { where: { vendaId: id }, relations: { produto: true }, order: { ordem: 'ASC' } });
      const avisos = await this.estoque.movimentar(
        m,
        empresaId,
        itens
          .filter((i) => i.produto.tipo === TipoProduto.PRODUTO)
          .map((i) => ({
            produtoId: i.produtoId,
            tipo: TipoMovimentacaoEstoque.SAIDA,
            origem: OrigemMovimentacaoEstoque.VENDA,
            quantidade: i.quantidade,
            descricao: `Venda nº ${venda.numero}`,
            data,
            vendaId: id,
          })),
      );
      await this.contasReceber.lancarDaOrigem(m, empresaId, {
        pessoaId: venda.clienteId,
        descricao: `Venda nº ${venda.numero}`,
        valor: venda.total,
        dataEmissao: data,
        primeiroVencimento,
        parcelas: venda.parcelas,
        planoContaId: venda.planoContaId,
        centroCustoId: venda.centroCustoId,
        origem: { vendaId: id },
      });
      await m.update(Venda, id, { status: StatusVenda.FATURADA, dataFaturamento: data });
      return avisos;
    });
    return { ...(await this.findOne(empresaId, id)), avisos };
  }

  /**
   * Orçamentos e pedidos só mudam de situação. Uma venda faturada tem o estoque devolvido e as
   * contas a receber canceladas, desde que nada tenha sido recebido; isso fica com ADMIN e FINANCEIRO.
   */
  async cancelar(empresaId: string, id: string, perfil: Perfil) {
    const avisos = await this.dataSource.transaction(async (m) => {
      const venda = await this.travar(m, empresaId, id);
      if (venda.status === StatusVenda.CANCELADA) throw new BadRequestException(`A venda nº ${venda.numero} já está cancelada`);
      let avisos: string[] = [];
      if (venda.status === StatusVenda.FATURADA) {
        if (perfil !== Perfil.ADMIN && perfil !== Perfil.FINANCEIRO) {
          throw new ForbiddenException('Só administradores e o financeiro cancelam vendas faturadas');
        }
        // Nota emitida precisa ser cancelada antes (aqui e no portal); a pendente cai junto com a venda.
        if (await m.existsBy(NotaServico, { vendaId: id, status: StatusNotaServico.EMITIDA })) {
          throw new BadRequestException(`A venda nº ${venda.numero} tem nota de serviço emitida; cancele a nota antes`);
        }
        await m.update(
          NotaServico,
          { vendaId: id, status: StatusNotaServico.PENDENTE },
          { status: StatusNotaServico.CANCELADA, motivoCancelamento: 'Venda cancelada' },
        );
        await this.contasReceber.cancelarDaOrigem(m, empresaId, { vendaId: id });
        avisos = await this.estoque.estornar(m, empresaId, { vendaId: id }, `Cancelamento da venda nº ${venda.numero}`);
      }
      await m.update(Venda, id, { status: StatusVenda.CANCELADA });
      return avisos;
    });
    return { ...(await this.findOne(empresaId, id)), avisos };
  }

  /** Confere os produtos, completa o preço pelo cadastro e calcula os totais em centavos. */
  private async montarItens(empresaId: string, itens: ItemVendaDto[]) {
    const produtos = await this.produtos.findBy({ empresaId, id: In(itens.map((i) => i.produtoId)) });
    const porId = new Map(produtos.map((p) => [p.id, p]));
    let total = 0;
    const montados = itens.map((item, i) => {
      const produto = porId.get(item.produtoId);
      if (!produto) throw new BadRequestException(`Produto ${item.produtoId} não encontrado`);
      if (!produto.ativo) throw new BadRequestException(`${produto.descricao} está inativo`);
      const preco = centavos(item.precoUnitario ?? produto.precoVenda);
      const desconto = centavos(item.desconto ?? 0);
      const totalDoItem = totalItem(milesimos(item.quantidade), preco, desconto);
      if (totalDoItem < 0) throw new BadRequestException(`O desconto de ${produto.descricao} é maior que o valor do item`);
      total += totalDoItem;
      return {
        produtoId: produto.id,
        ordem: i + 1,
        descricao: produto.descricao,
        quantidade: item.quantidade,
        precoUnitario: reais(preco),
        desconto: reais(desconto),
        total: reais(totalDoItem),
      };
    });
    return { itens: montados, total: reais(total) };
  }

  private async gravarItens(m: EntityManager, vendaId: string, itens: Partial<ItemVenda>[]) {
    await m.save(itens.map((item) => m.create(ItemVenda, { ...item, vendaId })));
  }

  private async validarCliente(empresaId: string, clienteId: string) {
    const cliente = await this.clientes.findOne(empresaId, clienteId);
    if (!cliente.ativo) throw new BadRequestException(`O cliente ${cliente.nome} está inativo`);
  }

  private async validarClassificacao(empresaId: string, dto: { planoContaId?: string | null; centroCustoId?: string | null }) {
    if (dto.planoContaId) await this.planoContas.findParaLancamento(empresaId, dto.planoContaId, TipoPlanoConta.RECEITA);
    if (dto.centroCustoId) await this.centrosCusto.findAtivo(empresaId, dto.centroCustoId);
  }

  /** Lê a venda com trava de escrita: duas pessoas não faturam nem cancelam a mesma venda ao mesmo tempo. */
  private async travar(m: EntityManager, empresaId: string, id: string) {
    const venda = await m.findOne(Venda, { where: { id, empresaId }, lock: { mode: 'pessimistic_write' } });
    if (!venda) throw new NotFoundException(`Venda ${id} não encontrada`);
    return venda;
  }
}

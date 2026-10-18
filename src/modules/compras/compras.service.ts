import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, EntityManager, FindOptionsWhere, In, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { hoje } from '../../common/datas';
import { centavos, reais } from '../../common/dinheiro';
import { proximoNumero } from '../../common/numeracao';
import { milesimos, totalItem } from '../../common/quantidade';
import { CentrosCustoService } from '../centros-custo/centros-custo.service';
import { ContasPagarService } from '../contas-pagar/contas-pagar.service';
import { EstoqueService } from '../estoque/estoque.service';
import { OrigemMovimentacaoEstoque, TipoMovimentacaoEstoque } from '../estoque/movimentacao-estoque.entity';
import { FornecedoresService } from '../fornecedores/fornecedores.service';
import { TipoPlanoConta } from '../plano-contas/plano-conta.entity';
import { PlanoContasService } from '../plano-contas/plano-contas.service';
import { Produto, TipoProduto } from '../produtos/produto.entity';
import { Compra, StatusCompra } from './compra.entity';
import { CreateCompraDto, ItemCompraDto } from './dto/create-compra.dto';
import { FiltroComprasDto } from './dto/filtro-compras.dto';
import { ReceberCompraDto } from './dto/receber-compra.dto';
import { UpdateCompraDto } from './dto/update-compra.dto';
import { ItemCompra } from './item-compra.entity';

@Injectable()
export class ComprasService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Compra) private readonly repo: Repository<Compra>,
    @InjectRepository(Produto) private readonly produtos: Repository<Produto>,
    private readonly fornecedores: FornecedoresService,
    private readonly planoContas: PlanoContasService,
    private readonly centrosCusto: CentrosCustoService,
    private readonly contasPagar: ContasPagarService,
    private readonly estoque: EstoqueService,
  ) {}

  findAll(empresaId: string, filtro: FiltroComprasDto) {
    const where: FindOptionsWhere<Compra> = { empresaId, status: filtro.status, fornecedorId: filtro.fornecedorId };
    if (filtro.de && filtro.ate) where.dataEmissao = Between(filtro.de, filtro.ate);
    else if (filtro.de) where.dataEmissao = MoreThanOrEqual(filtro.de);
    else if (filtro.ate) where.dataEmissao = LessThanOrEqual(filtro.ate);
    return this.repo.find({ where, relations: { fornecedor: true }, order: { numero: 'DESC' } });
  }

  /** A compra com itens, classificação e as contas a pagar que ela gerou. */
  async findOne(empresaId: string, id: string) {
    const compra = await this.repo.findOne({
      where: { id, empresaId },
      relations: { fornecedor: true, planoConta: true, centroCusto: true, itens: { produto: true } },
      order: { itens: { ordem: 'ASC' } },
    });
    if (!compra) throw new NotFoundException(`Compra ${id} não encontrada`);
    return { ...compra, contas: await this.contasPagar.findDaOrigem(empresaId, { compraId: id }) };
  }

  async create(empresaId: string, dto: CreateCompraDto) {
    await this.validarFornecedor(empresaId, dto.fornecedorId);
    await this.validarClassificacao(empresaId, dto);
    const { itens, total } = await this.montarItens(empresaId, dto.itens);
    const { itens: _, ...dados } = dto;

    const id = await this.dataSource.transaction(async (m) => {
      const compra = await m.save(
        m.create(Compra, {
          ...dados,
          empresaId,
          numero: await proximoNumero(m, 'compras', empresaId),
          status: StatusCompra.PEDIDO,
          dataEmissao: dto.dataEmissao ?? hoje(),
          total,
        }),
      );
      await this.gravarItens(m, compra.id, itens);
      return compra.id;
    });
    return this.findOne(empresaId, id);
  }

  async update(empresaId: string, id: string, dto: UpdateCompraDto) {
    if (dto.fornecedorId) await this.validarFornecedor(empresaId, dto.fornecedorId);
    await this.validarClassificacao(empresaId, dto);
    const montados = dto.itens && (await this.montarItens(empresaId, dto.itens));
    const { itens: _, ...dados } = dto;

    await this.dataSource.transaction(async (m) => {
      const compra = await this.travar(m, empresaId, id);
      if (compra.status !== StatusCompra.PEDIDO) {
        throw new BadRequestException(`Compra nº ${compra.numero} está ${compra.status} e não pode ser alterada`);
      }
      if (montados) {
        await m.delete(ItemCompra, { compraId: id });
        await this.gravarItens(m, id, montados.itens);
      }
      const alteracoes = { ...dados, ...(montados && { total: montados.total }) };
      if (Object.keys(alteracoes).length) await m.update(Compra, id, alteracoes);
    });
    return this.findOne(empresaId, id);
  }

  /** A mercadoria chegou: entra no estoque (atualizando o custo médio) e as contas a pagar são lançadas. */
  async receber(empresaId: string, id: string, dto: ReceberCompraDto) {
    await this.dataSource.transaction(async (m) => {
      const compra = await this.travar(m, empresaId, id);
      if (compra.status !== StatusCompra.PEDIDO) {
        throw new BadRequestException(`A compra nº ${compra.numero} está ${compra.status} e não pode ser recebida`);
      }
      const data = dto.data ?? hoje();
      if (data < compra.dataEmissao) throw new BadRequestException('O recebimento não pode ser antes da emissão do pedido');
      const primeiroVencimento = compra.primeiroVencimento ?? data;
      if (primeiroVencimento < data) {
        throw new BadRequestException('O primeiro vencimento não pode ser antes do recebimento');
      }
      await this.validarFornecedor(empresaId, compra.fornecedorId);

      const itens = await m.find(ItemCompra, { where: { compraId: id }, order: { ordem: 'ASC' } });
      await this.estoque.movimentar(
        m,
        empresaId,
        itens.map((i) => ({
          produtoId: i.produtoId,
          tipo: TipoMovimentacaoEstoque.ENTRADA,
          origem: OrigemMovimentacaoEstoque.COMPRA,
          quantidade: i.quantidade,
          custoUnitario: i.custoUnitario,
          descricao: `Compra nº ${compra.numero}`,
          data,
          compraId: id,
        })),
      );
      // Uma compra de valor zero (bonificação) só movimenta o estoque.
      if (compra.total > 0) {
        await this.contasPagar.lancarDaOrigem(m, empresaId, {
          pessoaId: compra.fornecedorId,
          descricao: `Compra nº ${compra.numero}`,
          valor: compra.total,
          dataEmissao: data,
          primeiroVencimento,
          parcelas: compra.parcelas,
          planoContaId: compra.planoContaId,
          centroCustoId: compra.centroCustoId,
          origem: { compraId: id },
        });
      }
      await m.update(Compra, id, { status: StatusCompra.RECEBIDA, dataRecebimento: data });
    });
    return this.findOne(empresaId, id);
  }

  /**
   * Pedidos só mudam de situação. Uma compra recebida tem a mercadoria retirada do estoque (com o custo
   * médio recalculado) e as contas a pagar canceladas, desde que nada tenha sido pago.
   */
  async cancelar(empresaId: string, id: string) {
    const avisos = await this.dataSource.transaction(async (m) => {
      const compra = await this.travar(m, empresaId, id);
      if (compra.status === StatusCompra.CANCELADA) {
        throw new BadRequestException(`A compra nº ${compra.numero} já está cancelada`);
      }
      let avisos: string[] = [];
      if (compra.status === StatusCompra.RECEBIDA) {
        await this.contasPagar.cancelarDaOrigem(m, empresaId, { compraId: id });
        avisos = await this.estoque.estornar(m, empresaId, { compraId: id }, `Cancelamento da compra nº ${compra.numero}`);
      }
      await m.update(Compra, id, { status: StatusCompra.CANCELADA });
      return avisos;
    });
    return { ...(await this.findOne(empresaId, id)), avisos };
  }

  /** Só produtos (não serviços) entram em compras de estoque; o custo padrão é o custo médio atual. */
  private async montarItens(empresaId: string, itens: ItemCompraDto[]) {
    const produtos = await this.produtos.findBy({ empresaId, id: In(itens.map((i) => i.produtoId)) });
    const porId = new Map(produtos.map((p) => [p.id, p]));
    let total = 0;
    const montados = itens.map((item, i) => {
      const produto = porId.get(item.produtoId);
      if (!produto) throw new BadRequestException(`Produto ${item.produtoId} não encontrado`);
      if (produto.tipo !== TipoProduto.PRODUTO) {
        throw new BadRequestException(`${produto.descricao} é um serviço; lance-o direto em contas a pagar`);
      }
      if (!produto.ativo) throw new BadRequestException(`${produto.descricao} está inativo`);
      const custo = centavos(item.custoUnitario ?? produto.custo ?? 0);
      const totalDoItem = totalItem(milesimos(item.quantidade), custo);
      total += totalDoItem;
      return {
        produtoId: produto.id,
        ordem: i + 1,
        descricao: produto.descricao,
        quantidade: item.quantidade,
        custoUnitario: reais(custo),
        total: reais(totalDoItem),
      };
    });
    return { itens: montados, total: reais(total) };
  }

  private async gravarItens(m: EntityManager, compraId: string, itens: Partial<ItemCompra>[]) {
    await m.save(itens.map((item) => m.create(ItemCompra, { ...item, compraId })));
  }

  private async validarFornecedor(empresaId: string, fornecedorId: string) {
    const fornecedor = await this.fornecedores.findOne(empresaId, fornecedorId);
    if (!fornecedor.ativo) throw new BadRequestException(`O fornecedor ${fornecedor.nome} está inativo`);
  }

  private async validarClassificacao(empresaId: string, dto: { planoContaId?: string | null; centroCustoId?: string | null }) {
    if (dto.planoContaId) await this.planoContas.findParaLancamento(empresaId, dto.planoContaId, TipoPlanoConta.DESPESA);
    if (dto.centroCustoId) await this.centrosCusto.findAtivo(empresaId, dto.centroCustoId);
  }

  private async travar(m: EntityManager, empresaId: string, id: string) {
    const compra = await m.findOne(Compra, { where: { id, empresaId }, lock: { mode: 'pessimistic_write' } });
    if (!compra) throw new NotFoundException(`Compra ${id} não encontrada`);
    return compra;
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, EntityManager, FindOptionsWhere, In, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { hoje } from '../../common/datas';
import { centavos, reais } from '../../common/dinheiro';
import { milesimos, quantidade } from '../../common/quantidade';
import { Produto, TipoProduto } from '../produtos/produto.entity';
import { AjusteEstoqueDto } from './dto/ajuste-estoque.dto';
import { FiltroMovimentacoesEstoqueDto } from './dto/filtro-movimentacoes-estoque.dto';
import { MovimentacaoEstoque, OrigemMovimentacaoEstoque, TipoMovimentacaoEstoque } from './movimentacao-estoque.entity';

/** Uma entrada ou saída pedida por uma venda, compra ou ajuste. */
export interface Movimento {
  produtoId: string;
  tipo: TipoMovimentacaoEstoque;
  origem: OrigemMovimentacaoEstoque;
  quantidade: number;
  /** Entrada: custo de aquisição (padrão: custo médio atual). Saída: padrão é o custo médio atual. */
  custoUnitario?: number;
  descricao: string;
  data: string;
  vendaId?: string;
  compraId?: string;
}

/** Custo médio ponderado, em centavos, depois de entrar qtd ao custo informado. */
function custoMedioAposEntrada(saldo: number, custoAtual: number | null, qtd: number, custoEntrada: number) {
  if (saldo <= 0 || custoAtual === null) return custoEntrada;
  return Math.round((saldo * custoAtual + qtd * custoEntrada) / (saldo + qtd));
}

/** Custo médio depois de devolver uma entrada (estorno de compra): retira o que ela tinha somado. */
function custoMedioAposDevolucao(saldo: number, custoAtual: number | null, qtd: number, custoSaida: number) {
  const restante = saldo - qtd;
  if (restante <= 0 || custoAtual === null) return custoAtual;
  return Math.max(0, Math.round((saldo * custoAtual - qtd * custoSaida) / restante));
}

@Injectable()
export class EstoqueService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(MovimentacaoEstoque) private readonly repo: Repository<MovimentacaoEstoque>,
    @InjectRepository(Produto) private readonly produtos: Repository<Produto>,
  ) {}

  /**
   * Aplica as movimentações dentro da transação de quem chama, travando os produtos em ordem de id
   * (duas vendas simultâneas não se perdem nem travam uma à outra). O saldo pode ficar negativo:
   * a resposta traz um aviso para cada produto nessa situação.
   */
  async movimentar(m: EntityManager, empresaId: string, movimentos: Movimento[]) {
    const ids = [...new Set(movimentos.map((mov) => mov.produtoId))].sort();
    const produtos = await m.getRepository(Produto).find({
      where: { id: In(ids), empresaId },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    const porId = new Map(produtos.map((p) => [p.id, p]));
    const negativos = new Map<string, Produto>();

    for (const mov of movimentos) {
      const produto = porId.get(mov.produtoId);
      if (!produto) throw new BadRequestException(`Produto ${mov.produtoId} não encontrado`);
      if (produto.tipo !== TipoProduto.PRODUTO) {
        throw new BadRequestException(`${produto.descricao} é um serviço e não controla estoque`);
      }
      const saldoAntes = milesimos(produto.estoque);
      const qtd = milesimos(mov.quantidade);
      const custoAtual = produto.custo === null ? null : centavos(produto.custo);
      const custoInformado = mov.custoUnitario === undefined ? (custoAtual ?? 0) : centavos(mov.custoUnitario);

      let saldo: number;
      let custoMedio = custoAtual;
      if (mov.tipo === TipoMovimentacaoEstoque.ENTRADA) {
        saldo = saldoAntes + qtd;
        custoMedio = custoMedioAposEntrada(saldoAntes, custoAtual, qtd, custoInformado);
      } else {
        saldo = saldoAntes - qtd;
        if (mov.origem === OrigemMovimentacaoEstoque.ESTORNO_COMPRA) {
          custoMedio = custoMedioAposDevolucao(saldoAntes, custoAtual, qtd, custoInformado);
        }
      }

      produto.estoque = quantidade(saldo);
      produto.custo = custoMedio === null ? null : reais(custoMedio);
      await m.getRepository(Produto).update(produto.id, { estoque: produto.estoque, custo: produto.custo });
      await m.save(
        m.create(MovimentacaoEstoque, {
          ...mov,
          empresaId,
          custoUnitario: reais(custoInformado),
          saldo: produto.estoque,
          descricao: mov.descricao.slice(0, 255),
        }),
      );
      if (saldo < 0) negativos.set(produto.id, produto);
      else negativos.delete(produto.id);
    }

    return [...negativos.values()].map(
      (p) => `${p.descricao}: o estoque ficou negativo (${String(p.estoque).replace('.', ',')} ${p.unidade})`,
    );
  }

  /** Desfaz, com movimentações opostas e o mesmo custo, tudo o que uma venda ou compra movimentou. */
  async estornar(
    m: EntityManager,
    empresaId: string,
    origem: { vendaId: string } | { compraId: string },
    descricao: string,
    data = hoje(),
  ) {
    const venda = 'vendaId' in origem;
    const originais = await m.find(MovimentacaoEstoque, {
      where: {
        empresaId,
        ...origem,
        origem: venda ? OrigemMovimentacaoEstoque.VENDA : OrigemMovimentacaoEstoque.COMPRA,
      },
      order: { seq: 'ASC' },
    });
    return this.movimentar(
      m,
      empresaId,
      originais.map((o) => ({
        produtoId: o.produtoId,
        tipo: o.tipo === TipoMovimentacaoEstoque.ENTRADA ? TipoMovimentacaoEstoque.SAIDA : TipoMovimentacaoEstoque.ENTRADA,
        origem: venda ? OrigemMovimentacaoEstoque.ESTORNO_VENDA : OrigemMovimentacaoEstoque.ESTORNO_COMPRA,
        quantidade: o.quantidade,
        custoUnitario: o.custoUnitario,
        descricao,
        data,
        ...origem,
      })),
    );
  }

  async ajustar(empresaId: string, dto: AjusteEstoqueDto) {
    return this.dataSource.transaction(async (m) => {
      const avisos = await this.movimentar(m, empresaId, [
        {
          produtoId: dto.produtoId,
          tipo: dto.tipo,
          origem: OrigemMovimentacaoEstoque.AJUSTE,
          quantidade: dto.quantidade,
          custoUnitario: dto.tipo === TipoMovimentacaoEstoque.ENTRADA ? dto.custoUnitario : undefined,
          descricao: dto.motivo,
          data: dto.data ?? hoje(),
        },
      ]);
      const produto = await m.findOneByOrFail(Produto, { id: dto.produtoId });
      return { produto: { id: produto.id, estoque: produto.estoque, custo: produto.custo }, avisos };
    });
  }

  /** Kardex: movimentações na ordem em que foram gravadas, com o saldo após cada uma. */
  findMovimentacoes(empresaId: string, filtro: FiltroMovimentacoesEstoqueDto) {
    const where: FindOptionsWhere<MovimentacaoEstoque> = {
      empresaId,
      produtoId: filtro.produtoId,
      vendaId: filtro.vendaId,
      compraId: filtro.compraId,
    };
    if (filtro.de && filtro.ate) where.data = Between(filtro.de, filtro.ate);
    else if (filtro.de) where.data = MoreThanOrEqual(filtro.de);
    else if (filtro.ate) where.data = LessThanOrEqual(filtro.ate);
    return this.repo.find({ where, relations: { produto: true }, order: { seq: 'ASC' } });
  }

  /**
   * Posição de cada produto: saldo físico, quanto está reservado em pedidos ainda não faturados,
   * o disponível para vender e o valor do estoque ao custo médio.
   */
  async posicao(empresaId: string) {
    const produtos = await this.produtos.find({
      where: { empresaId, tipo: TipoProduto.PRODUTO },
      order: { descricao: 'ASC' },
    });
    const reservas: { produtoId: string; reservado: string }[] = await this.dataSource.query(
      `SELECT i.produto_id AS "produtoId", SUM(i.quantidade) AS reservado
         FROM itens_venda i JOIN vendas v ON v.id = i.venda_id
        WHERE v.empresa_id = $1 AND v.status = 'PEDIDO'
        GROUP BY i.produto_id`,
      [empresaId],
    );
    const reservado = new Map(reservas.map((r) => [r.produtoId, milesimos(r.reservado)]));

    let valorTotal = 0;
    const itens = produtos.map((p) => {
      const estoque = milesimos(p.estoque);
      const reserva = reservado.get(p.id) ?? 0;
      const valor = p.custo === null || estoque <= 0 ? 0 : Math.round((estoque * centavos(p.custo)) / 1000);
      valorTotal += valor;
      return {
        produto: { id: p.id, codigo: p.codigo, descricao: p.descricao, unidade: p.unidade, ativo: p.ativo },
        estoque: p.estoque,
        reservado: quantidade(reserva),
        disponivel: quantidade(estoque - reserva),
        custoMedio: p.custo,
        valorEstoque: reais(valor),
      };
    });
    return { itens, valorTotal: reais(valorTotal) };
  }

  /** Um produto que já movimentou estoque não pode virar serviço. */
  temMovimentacoes(empresaId: string, produtoId: string) {
    return this.repo.existsBy({ empresaId, produtoId });
  }
}

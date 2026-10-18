import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Generated,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { decimalTransformer, quantidadeTransformer } from '../../common/decimal.transformer';
import { Compra } from '../compras/compra.entity';
import { Empresa } from '../empresas/empresa.entity';
import { Produto } from '../produtos/produto.entity';
import { Venda } from '../vendas/venda.entity';

export enum TipoMovimentacaoEstoque {
  ENTRADA = 'ENTRADA',
  SAIDA = 'SAIDA',
}

export enum OrigemMovimentacaoEstoque {
  COMPRA = 'COMPRA',
  VENDA = 'VENDA',
  /** Lançada à mão: inventário, perda, quebra, doação. */
  AJUSTE = 'AJUSTE',
  /** Cancelamento de uma compra recebida. */
  ESTORNO_COMPRA = 'ESTORNO_COMPRA',
  /** Cancelamento de uma venda faturada. */
  ESTORNO_VENDA = 'ESTORNO_VENDA',
}

/** Entrada ou saída de um produto (kardex). Guarda o saldo após a movimentação, na ordem de gravação. */
@Entity('movimentacoes_estoque')
@Check('CHK_movimentacoes_estoque_valores', '"quantidade" > 0 AND "custo_unitario" >= 0')
@Index('IDX_movimentacoes_estoque_produto_seq', ['produtoId', 'seq'])
@Index('IDX_movimentacoes_estoque_venda', ['vendaId'])
@Index('IDX_movimentacoes_estoque_compra', ['compraId'])
export class MovimentacaoEstoque {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_movimentacoes_estoque' })
  id: string;

  @Column({ name: 'empresa_id', type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empresa_id', foreignKeyConstraintName: 'FK_movimentacoes_estoque_empresa' })
  empresa: Empresa;

  @Column({ name: 'produto_id', type: 'uuid' })
  produtoId: string;

  @ManyToOne(() => Produto, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'produto_id', foreignKeyConstraintName: 'FK_movimentacoes_estoque_produto' })
  produto: Produto;

  @Column({ type: 'date' })
  data: string;

  @Column({ type: 'enum', enum: TipoMovimentacaoEstoque })
  tipo: TipoMovimentacaoEstoque;

  @Column({ type: 'enum', enum: OrigemMovimentacaoEstoque })
  origem: OrigemMovimentacaoEstoque;

  /** Sempre positiva; o sentido vem do tipo. */
  @Column({ type: 'numeric', precision: 14, scale: 3, transformer: quantidadeTransformer })
  quantidade: number;

  /** Na entrada, o custo de aquisição; na saída, o custo médio do momento. */
  @Column({ name: 'custo_unitario', type: 'numeric', precision: 14, scale: 2, transformer: decimalTransformer })
  custoUnitario: number;

  /** Saldo do produto logo após esta movimentação. */
  @Column({ type: 'numeric', precision: 14, scale: 3, transformer: quantidadeTransformer })
  saldo: number;

  @Column({ length: 255 })
  descricao: string;

  @Column({ name: 'venda_id', type: 'uuid', nullable: true })
  vendaId: string | null;

  @ManyToOne(() => Venda, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'venda_id', foreignKeyConstraintName: 'FK_movimentacoes_estoque_venda' })
  venda: Venda | null;

  @Column({ name: 'compra_id', type: 'uuid', nullable: true })
  compraId: string | null;

  @ManyToOne(() => Compra, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'compra_id', foreignKeyConstraintName: 'FK_movimentacoes_estoque_compra' })
  compra: Compra | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  /** Ordem de gravação, gerada pelo banco; o saldo de cada linha segue esta ordem. */
  @Column({ type: 'bigint', select: false })
  @Generated('increment')
  seq: string;
}

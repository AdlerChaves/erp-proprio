import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { decimalTransformer, quantidadeTransformer } from '../../common/decimal.transformer';
import { Produto } from '../produtos/produto.entity';
import { Compra } from './compra.entity';

@Entity('itens_compra')
@Check('CHK_itens_compra_valores', '"quantidade" > 0 AND "custo_unitario" >= 0 AND "total" >= 0')
@Index('IDX_itens_compra_compra', ['compraId'])
@Index('IDX_itens_compra_produto', ['produtoId'])
export class ItemCompra {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_itens_compra' })
  id: string;

  @Column({ name: 'compra_id', type: 'uuid' })
  compraId: string;

  @ManyToOne(() => Compra, (compra) => compra.itens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'compra_id', foreignKeyConstraintName: 'FK_itens_compra_compra' })
  compra: Compra;

  @Column({ name: 'produto_id', type: 'uuid' })
  produtoId: string;

  @ManyToOne(() => Produto, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'produto_id', foreignKeyConstraintName: 'FK_itens_compra_produto' })
  produto: Produto;

  @Column({ type: 'smallint' })
  ordem: number;

  @Column({ length: 255 })
  descricao: string;

  @Column({ type: 'numeric', precision: 14, scale: 3, transformer: quantidadeTransformer })
  quantidade: number;

  /** Custo de aquisição por unidade; entra no custo médio do produto. */
  @Column({ name: 'custo_unitario', type: 'numeric', precision: 14, scale: 2, transformer: decimalTransformer })
  custoUnitario: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: decimalTransformer })
  total: number;
}

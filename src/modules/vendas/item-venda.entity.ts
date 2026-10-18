import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { decimalTransformer, quantidadeTransformer } from '../../common/decimal.transformer';
import { Produto } from '../produtos/produto.entity';
import { Venda } from './venda.entity';

@Entity('itens_venda')
@Check('CHK_itens_venda_valores', '"quantidade" > 0 AND "preco_unitario" >= 0 AND "desconto" >= 0 AND "total" >= 0')
@Index('IDX_itens_venda_venda', ['vendaId'])
@Index('IDX_itens_venda_produto', ['produtoId'])
export class ItemVenda {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_itens_venda' })
  id: string;

  @Column({ name: 'venda_id', type: 'uuid' })
  vendaId: string;

  @ManyToOne(() => Venda, (venda) => venda.itens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venda_id', foreignKeyConstraintName: 'FK_itens_venda_venda' })
  venda: Venda;

  @Column({ name: 'produto_id', type: 'uuid' })
  produtoId: string;

  @ManyToOne(() => Produto, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'produto_id', foreignKeyConstraintName: 'FK_itens_venda_produto' })
  produto: Produto;

  @Column({ type: 'smallint' })
  ordem: number;

  /** Descrição do produto no momento da venda. */
  @Column({ length: 255 })
  descricao: string;

  @Column({ type: 'numeric', precision: 14, scale: 3, transformer: quantidadeTransformer })
  quantidade: number;

  @Column({ name: 'preco_unitario', type: 'numeric', precision: 14, scale: 2, transformer: decimalTransformer })
  precoUnitario: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0, transformer: decimalTransformer })
  desconto: number;

  /** quantidade × preço − desconto. */
  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: decimalTransformer })
  total: number;
}

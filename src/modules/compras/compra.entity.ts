import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../../common/decimal.transformer';
import { CentroCusto } from '../centros-custo/centro-custo.entity';
import { Fornecedor } from '../fornecedores/fornecedor.entity';
import { Empresa } from '../empresas/empresa.entity';
import { PlanoConta } from '../plano-contas/plano-conta.entity';
import { ItemCompra } from './item-compra.entity';

export enum StatusCompra {
  /** Encomendado ao fornecedor; ainda não mexe em estoque nem no financeiro. */
  PEDIDO = 'PEDIDO',
  /** Mercadoria recebida: entrada no estoque e contas a pagar geradas. */
  RECEBIDA = 'RECEBIDA',
  CANCELADA = 'CANCELADA',
}

@Entity('compras')
@Check('CHK_compras_parcelas', '"parcelas" BETWEEN 1 AND 120')
@Check('CHK_compras_total', '"total" >= 0')
@Index('UQ_compras_empresa_numero', ['empresaId', 'numero'], { unique: true })
@Index('IDX_compras_empresa_status', ['empresaId', 'status'])
@Index('IDX_compras_fornecedor', ['fornecedorId'])
export class Compra {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_compras' })
  id: string;

  @Column({ name: 'empresa_id', type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empresa_id', foreignKeyConstraintName: 'FK_compras_empresa' })
  empresa: Empresa;

  /** Sequencial por empresa: 1, 2, 3... */
  @Column({ type: 'integer' })
  numero: number;

  @Column({ name: 'fornecedor_id', type: 'uuid' })
  fornecedorId: string;

  @ManyToOne(() => Fornecedor, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'fornecedor_id', foreignKeyConstraintName: 'FK_compras_fornecedor' })
  fornecedor: Fornecedor;

  @Column({ type: 'enum', enum: StatusCompra, default: StatusCompra.PEDIDO })
  status: StatusCompra;

  @Column({ name: 'data_emissao', type: 'date' })
  dataEmissao: string;

  @Column({ name: 'data_recebimento', type: 'date', nullable: true })
  dataRecebimento: string | null;

  /** Condição de pagamento: parcelas mensais a partir do primeiro vencimento. */
  @Column({ type: 'smallint', default: 1 })
  parcelas: number;

  /** Sem data, vence no dia do recebimento (à vista). */
  @Column({ name: 'primeiro_vencimento', type: 'date', nullable: true })
  primeiroVencimento: string | null;

  /** Categoria de despesa das contas a pagar geradas. */
  @Column({ name: 'plano_conta_id', type: 'uuid', nullable: true })
  planoContaId: string | null;

  @ManyToOne(() => PlanoConta, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'plano_conta_id', foreignKeyConstraintName: 'FK_compras_plano_conta' })
  planoConta: PlanoConta | null;

  @Column({ name: 'centro_custo_id', type: 'uuid', nullable: true })
  centroCustoId: string | null;

  @ManyToOne(() => CentroCusto, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'centro_custo_id', foreignKeyConstraintName: 'FK_compras_centro_custo' })
  centroCusto: CentroCusto | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  observacoes: string | null;

  /** Soma dos itens. */
  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: decimalTransformer })
  total: number;

  @OneToMany(() => ItemCompra, (item) => item.compra)
  itens: ItemCompra[];

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}

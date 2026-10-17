import {
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
import { Cliente } from '../clientes/cliente.entity';
import { Empresa } from '../empresas/empresa.entity';
import { Baixa } from '../financeiro/baixa.entity';
import { ContaFinanceira } from '../financeiro/contas-financeiras.service';
import { StatusConta } from '../financeiro/status-conta.enum';
import { PlanoConta } from '../plano-contas/plano-conta.entity';

/** Valor a receber de um cliente. */
@Entity('contas_receber')
@Index('IDX_contas_receber_empresa_status_vencimento', ['empresaId', 'status', 'dataVencimento'])
@Index('IDX_contas_receber_cliente', ['clienteId'])
@Index('IDX_contas_receber_plano_conta', ['planoContaId'])
@Index('IDX_contas_receber_centro_custo', ['centroCustoId'])
@Index('IDX_contas_receber_parcelamento', ['parcelamentoId'])
export class ContaReceber implements ContaFinanceira {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_contas_receber' })
  id: string;

  @Column({ name: 'empresa_id', type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empresa_id', foreignKeyConstraintName: 'FK_contas_receber_empresa' })
  empresa: Empresa;

  @Column({ name: 'cliente_id', type: 'uuid' })
  clienteId: string;

  @ManyToOne(() => Cliente, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cliente_id', foreignKeyConstraintName: 'FK_contas_receber_cliente' })
  cliente: Cliente;

  /** Categoria (conta analítica do plano de contas). Opcional; pode ser definida depois. */
  @Column({ name: 'plano_conta_id', type: 'uuid', nullable: true })
  planoContaId: string | null;

  @ManyToOne(() => PlanoConta, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'plano_conta_id', foreignKeyConstraintName: 'FK_contas_receber_plano_conta' })
  planoConta: PlanoConta | null;

  @Column({ name: 'centro_custo_id', type: 'uuid', nullable: true })
  centroCustoId: string | null;

  @ManyToOne(() => CentroCusto, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'centro_custo_id', foreignKeyConstraintName: 'FK_contas_receber_centro_custo' })
  centroCusto: CentroCusto | null;

  @Column({ length: 255 })
  descricao: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: decimalTransformer })
  valor: number;

  @Column({ name: 'data_emissao', type: 'date' })
  dataEmissao: string;

  @Column({ name: 'data_vencimento', type: 'date' })
  dataVencimento: string;

  @Column({ type: 'enum', enum: StatusConta, default: StatusConta.ABERTA })
  status: StatusConta;

  /** Igual em todas as parcelas de um mesmo parcelamento. */
  @Column({ name: 'parcelamento_id', type: 'uuid', nullable: true })
  parcelamentoId: string | null;

  @Column({ type: 'smallint', nullable: true })
  parcela: number | null;

  @Column({ name: 'total_parcelas', type: 'smallint', nullable: true })
  totalParcelas: number | null;

  @OneToMany(() => Baixa, (baixa) => baixa.contaReceber)
  baixas: Baixa[];

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}

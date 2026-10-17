import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../../common/decimal.transformer';
import { CentroCusto } from '../centros-custo/centro-custo.entity';
import { ContaBancaria } from '../contas-bancarias/conta-bancaria.entity';
import { Empresa } from '../empresas/empresa.entity';
import { Fornecedor } from '../fornecedores/fornecedor.entity';
import { PlanoConta } from '../plano-contas/plano-conta.entity';

export enum StatusContaPagar {
  ABERTA = 'ABERTA',
  PAGA = 'PAGA',
  CANCELADA = 'CANCELADA',
}

@Entity('contas_pagar')
@Index('IDX_contas_pagar_empresa_status_vencimento', ['empresaId', 'status', 'dataVencimento'])
@Index('IDX_contas_pagar_fornecedor', ['fornecedorId'])
@Index('IDX_contas_pagar_plano_conta', ['planoContaId'])
@Index('IDX_contas_pagar_centro_custo', ['centroCustoId'])
@Index('IDX_contas_pagar_conta_bancaria', ['contaBancariaId'])
export class ContaPagar {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_contas_pagar' })
  id: string;

  @Column({ name: 'empresa_id', type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empresa_id', foreignKeyConstraintName: 'FK_contas_pagar_empresa' })
  empresa: Empresa;

  @Column({ name: 'fornecedor_id', type: 'uuid' })
  fornecedorId: string;

  @ManyToOne(() => Fornecedor, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'fornecedor_id', foreignKeyConstraintName: 'FK_contas_pagar_fornecedor' })
  fornecedor: Fornecedor;

  /** Categoria de despesa (conta analítica do plano de contas). Opcional; pode ser definida depois. */
  @Column({ name: 'plano_conta_id', type: 'uuid', nullable: true })
  planoContaId: string | null;

  @ManyToOne(() => PlanoConta, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'plano_conta_id', foreignKeyConstraintName: 'FK_contas_pagar_plano_conta' })
  planoConta: PlanoConta | null;

  @Column({ name: 'centro_custo_id', type: 'uuid', nullable: true })
  centroCustoId: string | null;

  @ManyToOne(() => CentroCusto, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'centro_custo_id', foreignKeyConstraintName: 'FK_contas_pagar_centro_custo' })
  centroCusto: CentroCusto | null;

  /** Conta bancária ou caixa de onde o pagamento saiu; preenchida na baixa. */
  @Column({ name: 'conta_bancaria_id', type: 'uuid', nullable: true })
  contaBancariaId: string | null;

  @ManyToOne(() => ContaBancaria, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'conta_bancaria_id', foreignKeyConstraintName: 'FK_contas_pagar_conta_bancaria' })
  contaBancaria: ContaBancaria | null;

  @Column({ length: 255 })
  descricao: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: decimalTransformer })
  valor: number;

  @Column({ name: 'data_emissao', type: 'date' })
  dataEmissao: string;

  @Column({ name: 'data_vencimento', type: 'date' })
  dataVencimento: string;

  @Column({ name: 'data_pagamento', type: 'date', nullable: true })
  dataPagamento: string | null;

  @Column({
    name: 'valor_pago',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  valorPago: number | null;

  @Column({ type: 'enum', enum: StatusContaPagar, default: StatusContaPagar.ABERTA })
  status: StatusContaPagar;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}

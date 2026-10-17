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
import { Cliente } from '../clientes/cliente.entity';
import { ContaBancaria } from '../contas-bancarias/conta-bancaria.entity';
import { Empresa } from '../empresas/empresa.entity';
import { PlanoConta } from '../plano-contas/plano-conta.entity';

export enum StatusContaReceber {
  ABERTA = 'ABERTA',
  PAGA = 'PAGA',
  CANCELADA = 'CANCELADA',
}

@Entity('contas_receber')
@Index('IDX_contas_receber_empresa_status_vencimento', ['empresaId', 'status', 'dataVencimento'])
@Index('IDX_contas_receber_cliente', ['clienteId'])
@Index('IDX_contas_receber_plano_conta', ['planoContaId'])
@Index('IDX_contas_receber_centro_custo', ['centroCustoId'])
@Index('IDX_contas_receber_conta_bancaria', ['contaBancariaId'])
export class ContaReceber {
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

  /** Categoria de receita (conta analítica do plano de contas). Opcional; pode ser definida depois. */
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

  /** Conta bancária ou caixa onde o pagamento entrou; preenchida na baixa. */
  @Column({ name: 'conta_bancaria_id', type: 'uuid', nullable: true })
  contaBancariaId: string | null;

  @ManyToOne(() => ContaBancaria, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'conta_bancaria_id', foreignKeyConstraintName: 'FK_contas_receber_conta_bancaria' })
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

  @Column({ type: 'enum', enum: StatusContaReceber, default: StatusContaReceber.ABERTA })
  status: StatusContaReceber;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}

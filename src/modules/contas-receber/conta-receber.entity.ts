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
import { Cliente } from '../clientes/cliente.entity';
import { Empresa } from '../empresas/empresa.entity';

export enum StatusContaReceber {
  ABERTA = 'ABERTA',
  PAGA = 'PAGA',
  CANCELADA = 'CANCELADA',
}

@Entity('contas_receber')
@Index('IDX_contas_receber_empresa_status_vencimento', ['empresaId', 'status', 'dataVencimento'])
@Index('IDX_contas_receber_cliente', ['clienteId'])
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

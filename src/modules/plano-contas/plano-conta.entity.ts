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
import { Empresa } from '../empresas/empresa.entity';

export enum TipoPlanoConta {
  RECEITA = 'RECEITA',
  DESPESA = 'DESPESA',
}

/**
 * Categoria financeira (receita ou despesa), organizada em árvore pelo código: 1, 1.01, 1.01.001...
 * Contas sintéticas agrupam outras; só as analíticas (aceitaLancamento) recebem lançamentos.
 */
@Entity('plano_contas')
@Index('UQ_plano_contas_empresa_codigo', ['empresaId', 'codigo'], { unique: true })
@Index('IDX_plano_contas_conta_pai', ['contaPaiId'])
export class PlanoConta {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_plano_contas' })
  id: string;

  @Column({ name: 'empresa_id', type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empresa_id', foreignKeyConstraintName: 'FK_plano_contas_empresa' })
  empresa: Empresa;

  @Column({ length: 20 })
  codigo: string;

  @Column({ length: 150 })
  nome: string;

  @Column({ type: 'enum', enum: TipoPlanoConta })
  tipo: TipoPlanoConta;

  @Column({ name: 'conta_pai_id', type: 'uuid', nullable: true })
  contaPaiId: string | null;

  @ManyToOne(() => PlanoConta, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'conta_pai_id', foreignKeyConstraintName: 'FK_plano_contas_conta_pai' })
  contaPai: PlanoConta | null;

  @Column({ name: 'aceita_lancamento', default: true })
  aceitaLancamento: boolean;

  @Column({ default: true })
  ativo: boolean;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}

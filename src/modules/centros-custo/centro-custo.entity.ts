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

/** Departamento, projeto ou unidade para separar receitas e despesas. */
@Entity('centros_custo')
@Index('UQ_centros_custo_empresa_nome', ['empresaId', 'nome'], { unique: true })
export class CentroCusto {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_centros_custo' })
  id: string;

  @Column({ name: 'empresa_id', type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empresa_id', foreignKeyConstraintName: 'FK_centros_custo_empresa' })
  empresa: Empresa;

  @Column({ length: 100 })
  nome: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  descricao: string | null;

  @Column({ default: true })
  ativo: boolean;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}

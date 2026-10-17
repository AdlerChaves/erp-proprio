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

@Entity('fornecedores')
@Index('UQ_fornecedores_empresa_documento', ['empresaId', 'documento'], { unique: true })
export class Fornecedor {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_fornecedores' })
  id: string;

  @Column({ name: 'empresa_id', type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empresa_id', foreignKeyConstraintName: 'FK_fornecedores_empresa' })
  empresa: Empresa;

  @Column({ length: 150 })
  nome: string;

  // CPF (11) ou CNPJ (14), somente dígitos. Único dentro da empresa.
  @Column({ length: 14 })
  documento: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefone: string | null;

  @Column({ default: true })
  ativo: boolean;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}

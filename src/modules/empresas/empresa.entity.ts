import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('empresas')
@Unique('UQ_empresas_cnpj', ['cnpj'])
export class Empresa {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_empresas' })
  id: string;

  @Column({ name: 'razao_social', length: 150 })
  razaoSocial: string;

  @Column({ name: 'nome_fantasia', type: 'varchar', length: 150, nullable: true })
  nomeFantasia: string | null;

  // Somente dígitos.
  @Column({ length: 14 })
  cnpj: string;

  @Column({ default: true })
  ativo: boolean;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}

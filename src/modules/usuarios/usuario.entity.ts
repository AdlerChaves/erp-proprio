import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('usuarios')
@Unique('UQ_usuarios_email', ['email'])
export class Usuario {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_usuarios' })
  id: string;

  @Column({ length: 150 })
  nome: string;

  // Sempre em minúsculas.
  @Column({ length: 150 })
  email: string;

  @Column({ name: 'senha_hash', length: 255, select: false })
  senhaHash: string;

  @Column({ default: true })
  ativo: boolean;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}

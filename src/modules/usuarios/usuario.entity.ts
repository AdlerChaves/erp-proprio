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

  /** Incrementada ao trocar a senha ou encerrar as sessões: tokens com versão anterior deixam de valer. */
  @Column({ name: 'token_versao', type: 'int', default: 1 })
  tokenVersao: number;

  /** Senhas erradas seguidas desde o último login bem-sucedido ou bloqueio. */
  @Column({ name: 'tentativas_login', type: 'int', default: 0, select: false })
  tentativasLogin: number;

  @Column({ name: 'bloqueado_ate', type: 'timestamptz', nullable: true, select: false })
  bloqueadoAte: Date | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}

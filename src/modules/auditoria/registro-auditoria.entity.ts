import { Column, CreateDateColumn, Entity, Generated, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Registro de quem fez o quê. Sem chaves estrangeiras de propósito: o histórico continua
 * existindo mesmo se o usuário ou o registro alterado forem removidos.
 */
@Entity('auditoria')
@Index('IDX_auditoria_empresa_criado', ['empresaId', 'criadoEm'])
@Index('IDX_auditoria_empresa_seq', ['empresaId', 'seq'])
@Index('IDX_auditoria_usuario', ['usuarioId'])
@Index('IDX_auditoria_recurso', ['recurso', 'recursoId'])
export class RegistroAuditoria {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_auditoria' })
  id: string;

  /** Nulo em eventos fora de uma empresa, como tentativas de login com senha errada. */
  @Column({ name: 'empresa_id', type: 'uuid', nullable: true })
  empresaId: string | null;

  @Column({ name: 'usuario_id', type: 'uuid', nullable: true })
  usuarioId: string | null;

  /** Ex.: "POST /api/contas-receber/:id/baixas" ou "LOGIN_FALHOU". */
  @Column({ length: 150 })
  acao: string;

  /** Primeiro segmento da rota, ex.: "contas-receber". */
  @Column({ type: 'varchar', length: 60, nullable: true })
  recurso: string | null;

  @Column({ name: 'recurso_id', type: 'uuid', nullable: true })
  recursoId: string | null;

  /** Corpo da requisição, sem senhas nem tokens. */
  @Column({ type: 'jsonb', nullable: true })
  dados: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  /**
   * Ordem de gravação, gerada pelo banco. A listagem ordena por aqui, e não por criadoEm,
   * porque o relógio do servidor pode ser ajustado para trás.
   */
  @Column({ type: 'bigint', select: false })
  @Generated('increment')
  seq: string;
}

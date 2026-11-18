import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Empresa } from '../empresas/empresa.entity';

/** Etapa do modelo da empresa, copiada para uma obra ao aplicar as etapas padrão. */
@Entity('etapas_padrao')
@Index('UQ_etapas_padrao_empresa_nome', ['empresaId', 'nome'], { unique: true })
export class EtapaPadrao {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_etapas_padrao' })
  id: string;

  @Column({ name: 'empresa_id', type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empresa_id', foreignKeyConstraintName: 'FK_etapas_padrao_empresa' })
  empresa: Empresa;

  @Column({ length: 100 })
  nome: string;

  /** Posição na lista, a partir de 1. */
  @Column({ type: 'smallint' })
  ordem: number;

  /** Inativa: fica no cadastro, mas não é copiada para obras novas. */
  @Column({ default: true })
  ativo: boolean;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}

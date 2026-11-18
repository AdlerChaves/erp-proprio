import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CentroCusto } from '../centros-custo/centro-custo.entity';
import { Empresa } from '../empresas/empresa.entity';

/** Etapa de uma obra (Centro de Custo). A etapa atual é a primeira, na ordem, ainda não concluída. */
@Entity('etapas_centro_custo')
@Index('IDX_etapas_centro_custo_centro', ['centroCustoId', 'ordem'])
export class EtapaCentroCusto {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_etapas_centro_custo' })
  id: string;

  @Column({ name: 'empresa_id', type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empresa_id', foreignKeyConstraintName: 'FK_etapas_centro_custo_empresa' })
  empresa: Empresa;

  /** As etapas pertencem à obra: excluir o Centro de Custo leva as etapas junto. */
  @Column({ name: 'centro_custo_id', type: 'uuid' })
  centroCustoId: string;

  @ManyToOne(() => CentroCusto, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'centro_custo_id', foreignKeyConstraintName: 'FK_etapas_centro_custo_centro' })
  centroCusto: CentroCusto;

  @Column({ length: 100 })
  nome: string;

  /** Posição na obra, a partir de 1. */
  @Column({ type: 'smallint' })
  ordem: number;

  @Column({ name: 'data_limite', type: 'date', nullable: true })
  dataLimite: string | null;

  @Column({ name: 'concluida_em', type: 'date', nullable: true })
  concluidaEm: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}

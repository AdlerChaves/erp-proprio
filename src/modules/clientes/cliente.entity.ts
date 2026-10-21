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
import type { EnderecoDto as Endereco } from '../../common/endereco.dto';
import { Empresa } from '../empresas/empresa.entity';

@Entity('clientes')
@Index('UQ_clientes_empresa_documento', ['empresaId', 'documento'], { unique: true })
export class Cliente {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_clientes' })
  id: string;

  @Column({ name: 'empresa_id', type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empresa_id', foreignKeyConstraintName: 'FK_clientes_empresa' })
  empresa: Empresa;

  @Column({ length: 150 })
  nome: string;

  // CPF (11) ou CNPJ (14), somente dígitos. Único dentro da empresa. Pode faltar num cliente ainda em
  // negociação (proposta antes de pedir os documentos); a nota de serviço exige.
  @Column({ type: 'varchar', length: 14, nullable: true })
  documento: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefone: string | null;

  /** Indicador (inscrição) municipal do tomador, se houver. */
  @Column({ name: 'inscricao_municipal', type: 'varchar', length: 15, nullable: true })
  inscricaoMunicipal: string | null;

  /** Endereço no Brasil; vai para o tomador na nota de serviço. */
  @Column({ type: 'jsonb', nullable: true })
  endereco: Endereco | null;

  @Column({ default: true })
  ativo: boolean;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}

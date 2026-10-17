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
import { decimalTransformer } from '../../common/decimal.transformer';
import { Empresa } from '../empresas/empresa.entity';

export enum TipoProduto {
  PRODUTO = 'PRODUTO',
  SERVICO = 'SERVICO',
}

/** Produtos e serviços vendidos ou comprados pela empresa. */
@Entity('produtos')
@Index('UQ_produtos_empresa_codigo', ['empresaId', 'codigo'], { unique: true })
export class Produto {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_produtos' })
  id: string;

  @Column({ name: 'empresa_id', type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empresa_id', foreignKeyConstraintName: 'FK_produtos_empresa' })
  empresa: Empresa;

  /** Código interno (SKU), único dentro da empresa. */
  @Column({ length: 60 })
  codigo: string;

  @Column({ length: 255 })
  descricao: string;

  @Column({ type: 'enum', enum: TipoProduto })
  tipo: TipoProduto;

  @Column({ length: 6 })
  unidade: string;

  @Column({ name: 'preco_venda', type: 'numeric', precision: 14, scale: 2, transformer: decimalTransformer })
  precoVenda: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true, transformer: decimalTransformer })
  custo: number | null;

  /** Só para produtos: classificação fiscal de 8 dígitos. */
  @Column({ type: 'varchar', length: 8, nullable: true })
  ncm: string | null;

  /** Só para serviços: item da lista da LC 116/2003, no formato 00.00. */
  @Column({ name: 'codigo_servico', type: 'varchar', length: 5, nullable: true })
  codigoServico: string | null;

  @Column({ default: true })
  ativo: boolean;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}

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
import { decimalTransformer, quantidadeTransformer } from '../../common/decimal.transformer';
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

  /** Custo médio: informado no cadastro e recalculado a cada entrada no estoque. */
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true, transformer: decimalTransformer })
  custo: number | null;

  /** Saldo físico. Só produtos controlam estoque; pode ficar negativo (venda sem saldo, com aviso). */
  @Column({ type: 'numeric', precision: 14, scale: 3, default: 0, transformer: quantidadeTransformer })
  estoque: number;

  /** Só para produtos: classificação fiscal de 8 dígitos. */
  @Column({ type: 'varchar', length: 8, nullable: true })
  ncm: string | null;

  /** Só para serviços: item da lista da LC 116/2003, no formato 00.00. */
  @Column({ name: 'codigo_servico', type: 'varchar', length: 5, nullable: true })
  codigoServico: string | null;

  /** Só para serviços: código de tributação nacional (cTribNac) da NFS-e, 6 dígitos, como 010701. */
  @Column({ name: 'codigo_tributacao_nacional', type: 'varchar', length: 6, nullable: true })
  codigoTributacaoNacional: string | null;

  /** Só para serviços: código NBS de 9 dígitos (Nomenclatura Brasileira de Serviços). */
  @Column({ name: 'codigo_nbs', type: 'varchar', length: 9, nullable: true })
  codigoNbs: string | null;

  @Column({ default: true })
  ativo: boolean;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}

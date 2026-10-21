import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { decimalTransformer } from '../../common/decimal.transformer';
import { ContaBancaria } from '../contas-bancarias/conta-bancaria.entity';
import { Empresa } from '../empresas/empresa.entity';
import { MovimentacaoBancaria, TipoMovimentacao } from '../movimentacoes/movimentacao-bancaria.entity';
import { ImportacaoExtrato } from './importacao-extrato.entity';

/**
 * Transação do extrato do banco. Conciliada quando aponta para a movimentação do sistema que a explica;
 * se essa movimentação for removida (estorno de baixa, por exemplo), a linha volta a ficar pendente.
 */
@Entity('linhas_extrato')
@Check('CHK_linhas_extrato_valor', '"valor" > 0')
@Index('UQ_linhas_extrato_conta_chave', ['contaBancariaId', 'chave'], { unique: true })
@Index('UQ_linhas_extrato_movimentacao', ['movimentacaoId'], { unique: true })
@Index('IDX_linhas_extrato_conta_data', ['contaBancariaId', 'data'])
@Index('IDX_linhas_extrato_importacao', ['importacaoId'])
export class LinhaExtrato {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_linhas_extrato' })
  id: string;

  @Column({ name: 'empresa_id', type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empresa_id', foreignKeyConstraintName: 'FK_linhas_extrato_empresa' })
  empresa: Empresa;

  @Column({ name: 'conta_bancaria_id', type: 'uuid' })
  contaBancariaId: string;

  @ManyToOne(() => ContaBancaria, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'conta_bancaria_id', foreignKeyConstraintName: 'FK_linhas_extrato_conta_bancaria' })
  contaBancaria: ContaBancaria;

  @Column({ name: 'importacao_id', type: 'uuid' })
  importacaoId: string;

  @ManyToOne(() => ImportacaoExtrato, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'importacao_id', foreignKeyConstraintName: 'FK_linhas_extrato_importacao' })
  importacao: ImportacaoExtrato;

  /** Impede importar a mesma transação duas vezes (FITID + data + valor). */
  @Column({ length: 40 })
  chave: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fitid: string | null;

  @Column({ type: 'date' })
  data: string;

  @Column({ type: 'enum', enum: TipoMovimentacao })
  tipo: TipoMovimentacao;

  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: decimalTransformer })
  valor: number;

  @Column({ length: 255 })
  descricao: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  documento: string | null;

  @Column({ name: 'movimentacao_id', type: 'uuid', nullable: true })
  movimentacaoId: string | null;

  @ManyToOne(() => MovimentacaoBancaria, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'movimentacao_id', foreignKeyConstraintName: 'FK_linhas_extrato_movimentacao' })
  movimentacao: MovimentacaoBancaria | null;

  /** Linha que não precisa de lançamento no sistema (ex.: aplicação e resgate automáticos que se anulam). */
  @Column({ default: false })
  ignorada: boolean;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;
}

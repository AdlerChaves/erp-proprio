import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { decimalTransformer } from '../../common/decimal.transformer';
import { ContaBancaria } from '../contas-bancarias/conta-bancaria.entity';
import { Empresa } from '../empresas/empresa.entity';

/** Um arquivo OFX importado: período, saldo informado pelo banco e quantas transações eram novas. */
@Entity('importacoes_extrato')
@Index('IDX_importacoes_extrato_conta', ['contaBancariaId'])
export class ImportacaoExtrato {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_importacoes_extrato' })
  id: string;

  @Column({ name: 'empresa_id', type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empresa_id', foreignKeyConstraintName: 'FK_importacoes_extrato_empresa' })
  empresa: Empresa;

  @Column({ name: 'conta_bancaria_id', type: 'uuid' })
  contaBancariaId: string;

  @ManyToOne(() => ContaBancaria, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'conta_bancaria_id', foreignKeyConstraintName: 'FK_importacoes_extrato_conta_bancaria' })
  contaBancaria: ContaBancaria;

  @Column({ name: 'nome_arquivo', length: 255 })
  nomeArquivo: string;

  /** Conta informada no arquivo (ACCTID), para conferir se o extrato é desta conta. */
  @Column({ name: 'conta_arquivo', type: 'varchar', length: 40, nullable: true })
  contaArquivo: string | null;

  @Column({ type: 'date', nullable: true })
  de: string | null;

  @Column({ type: 'date', nullable: true })
  ate: string | null;

  @Column({ name: 'saldo_banco', type: 'numeric', precision: 14, scale: 2, nullable: true, transformer: decimalTransformer })
  saldoBanco: number | null;

  @Column({ name: 'data_saldo_banco', type: 'date', nullable: true })
  dataSaldoBanco: string | null;

  @Column({ type: 'integer' })
  transacoes: number;

  @Column({ type: 'integer' })
  novas: number;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;
}

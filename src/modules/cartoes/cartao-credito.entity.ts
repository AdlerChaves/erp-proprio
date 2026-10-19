import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { decimalTransformer } from '../../common/decimal.transformer';
import { ContaBancaria } from '../contas-bancarias/conta-bancaria.entity';
import { Empresa } from '../empresas/empresa.entity';
import { Fornecedor } from '../fornecedores/fornecedor.entity';

/** Cartão de crédito da empresa. A fatura de cada mês vira uma conta a pagar, paga pela conta bancária do cartão. */
@Entity('cartoes_credito')
@Check('CHK_cartoes_credito_dias', '"dia_fechamento" BETWEEN 1 AND 31 AND "dia_vencimento" BETWEEN 1 AND 31')
@Index('UQ_cartoes_credito_empresa_nome', ['empresaId', 'nome'], { unique: true })
export class CartaoCredito {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_cartoes_credito' })
  id: string;

  @Column({ name: 'empresa_id', type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empresa_id', foreignKeyConstraintName: 'FK_cartoes_credito_empresa' })
  empresa: Empresa;

  @Column({ length: 100 })
  nome: string;

  /** Últimos 4 dígitos, para reconhecer o cartão. */
  @Column({ type: 'varchar', length: 4, nullable: true })
  final: string | null;

  /** Conta de onde a fatura é paga (sugerida na baixa). */
  @Column({ name: 'conta_bancaria_id', type: 'uuid' })
  contaBancariaId: string;

  @ManyToOne(() => ContaBancaria, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'conta_bancaria_id', foreignKeyConstraintName: 'FK_cartoes_credito_conta_bancaria' })
  contaBancaria: ContaBancaria;

  /** Emissor (banco do cartão): é o fornecedor da conta a pagar da fatura. */
  @Column({ name: 'fornecedor_id', type: 'uuid' })
  fornecedorId: string;

  @ManyToOne(() => Fornecedor, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'fornecedor_id', foreignKeyConstraintName: 'FK_cartoes_credito_fornecedor' })
  fornecedor: Fornecedor;

  /** Dia padrão do fechamento; cada fatura pode ter a sua data ajustada. */
  @Column({ name: 'dia_fechamento', type: 'smallint' })
  diaFechamento: number;

  @Column({ name: 'dia_vencimento', type: 'smallint' })
  diaVencimento: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true, transformer: decimalTransformer })
  limite: number | null;

  @Column({ default: true })
  ativo: boolean;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}

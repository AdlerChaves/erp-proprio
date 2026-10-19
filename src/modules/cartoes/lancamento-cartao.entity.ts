import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Generated,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { decimalTransformer } from '../../common/decimal.transformer';
import { CentroCusto } from '../centros-custo/centro-custo.entity';
import { Empresa } from '../empresas/empresa.entity';
import { Fornecedor } from '../fornecedores/fornecedor.entity';
import { PlanoConta } from '../plano-contas/plano-conta.entity';
import { CartaoCredito } from './cartao-credito.entity';
import { FaturaCartao } from './fatura-cartao.entity';

export enum TipoLancamentoCartao {
  COMPRA = 'COMPRA',
  /** Crédito na fatura: devolução, cancelamento de compra, cashback. */
  ESTORNO = 'ESTORNO',
}

/** Compra ou estorno no cartão. Uma compra parcelada gera um lançamento por parcela, um em cada fatura. */
@Entity('lancamentos_cartao')
@Check('CHK_lancamentos_cartao_valor', '"valor" > 0')
@Index('IDX_lancamentos_cartao_fatura', ['faturaId'])
@Index('IDX_lancamentos_cartao_compra', ['compraId'])
@Index('IDX_lancamentos_cartao_cartao_data', ['cartaoId', 'data'])
@Index('IDX_lancamentos_cartao_plano_conta', ['planoContaId'])
export class LancamentoCartao {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_lancamentos_cartao' })
  id: string;

  @Column({ name: 'empresa_id', type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empresa_id', foreignKeyConstraintName: 'FK_lancamentos_cartao_empresa' })
  empresa: Empresa;

  @Column({ name: 'cartao_id', type: 'uuid' })
  cartaoId: string;

  @ManyToOne(() => CartaoCredito, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cartao_id', foreignKeyConstraintName: 'FK_lancamentos_cartao_cartao' })
  cartao: CartaoCredito;

  @Column({ name: 'fatura_id', type: 'uuid' })
  faturaId: string;

  @ManyToOne(() => FaturaCartao, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'fatura_id', foreignKeyConstraintName: 'FK_lancamentos_cartao_fatura' })
  fatura: FaturaCartao;

  /** Igual em todas as parcelas de uma mesma compra. */
  @Column({ name: 'compra_id', type: 'uuid' })
  compraId: string;

  /** Data da compra (em todas as parcelas): é a data da despesa na DRE por competência. */
  @Column({ type: 'date' })
  data: string;

  @Column({ length: 255 })
  descricao: string;

  @Column({ type: 'enum', enum: TipoLancamentoCartao, default: TipoLancamentoCartao.COMPRA })
  tipo: TipoLancamentoCartao;

  /** Sempre positivo; o estorno é descontado da fatura. */
  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: decimalTransformer })
  valor: number;

  @Column({ type: 'smallint', nullable: true })
  parcela: number | null;

  @Column({ name: 'total_parcelas', type: 'smallint', nullable: true })
  totalParcelas: number | null;

  /** Categoria de despesa; é ela que aparece na DRE, não a fatura. */
  @Column({ name: 'plano_conta_id', type: 'uuid', nullable: true })
  planoContaId: string | null;

  @ManyToOne(() => PlanoConta, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'plano_conta_id', foreignKeyConstraintName: 'FK_lancamentos_cartao_plano_conta' })
  planoConta: PlanoConta | null;

  @Column({ name: 'centro_custo_id', type: 'uuid', nullable: true })
  centroCustoId: string | null;

  @ManyToOne(() => CentroCusto, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'centro_custo_id', foreignKeyConstraintName: 'FK_lancamentos_cartao_centro_custo' })
  centroCusto: CentroCusto | null;

  /** Onde a compra foi feita, se for um fornecedor cadastrado. */
  @Column({ name: 'fornecedor_id', type: 'uuid', nullable: true })
  fornecedorId: string | null;

  @ManyToOne(() => Fornecedor, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'fornecedor_id', foreignKeyConstraintName: 'FK_lancamentos_cartao_fornecedor' })
  fornecedor: Fornecedor | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @Column({ type: 'bigint', select: false })
  @Generated('increment')
  seq: string;
}

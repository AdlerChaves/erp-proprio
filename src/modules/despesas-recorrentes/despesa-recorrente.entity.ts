import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { decimalTransformer } from '../../common/decimal.transformer';
import { CentroCusto } from '../centros-custo/centro-custo.entity';
import { Empresa } from '../empresas/empresa.entity';
import { Fornecedor } from '../fornecedores/fornecedor.entity';
import { PlanoConta } from '../plano-contas/plano-conta.entity';

export enum SituacaoDespesa {
  ATIVA = 'ATIVA',
  PAUSADA = 'PAUSADA',
  ENCERRADA = 'ENCERRADA',
}

export enum TipoValorDespesa {
  /** Sempre o mesmo valor (aluguel, pró-labore, honorários). */
  FIXO = 'FIXO',
  /** Varia todo mês (energia, água): prevista pela média das últimas contas reais, ou pelo valor informado. */
  ESTIMADO = 'ESTIMADO',
  /** Percentual do faturamento do mês anterior (DAS do Simples Nacional, comissões). */
  PERCENTUAL_FATURAMENTO = 'PERCENTUAL_FATURAMENTO',
}

export enum AjusteDiaUtil {
  /** Vencimento em dia sem expediente bancário passa para o dia útil anterior (impostos, como o DAS). */
  ANTECIPAR = 'ANTECIPAR',
  /** Passa para o dia útil seguinte (boletos em geral). */
  POSTERGAR = 'POSTERGAR',
  MANTER = 'MANTER',
}

/**
 * Despesa que se repete (aluguel, pró-labore, energia, DAS, IPTU). Alguns dias antes de cada vencimento, o ERP
 * lança a conta a pagar sozinho; até lá, a projeção do caixa já conta com ela. Competências são "AAAA-MM",
 * o mês do vencimento.
 */
@Entity('despesas_recorrentes')
@Check('CHK_despesas_recorrentes_intervalo', '"intervalo_meses" IN (1, 2, 3, 6, 12)')
@Check('CHK_despesas_recorrentes_dia', '"dia_vencimento" BETWEEN 1 AND 31')
@Check('CHK_despesas_recorrentes_antecedencia', '"dias_antecedencia" BETWEEN 0 AND 60')
@Check('CHK_despesas_recorrentes_vigencia', '"fim" IS NULL OR "fim" >= "inicio"')
@Check(
  'CHK_despesas_recorrentes_valor',
  `("tipo_valor" = 'PERCENTUAL_FATURAMENTO' AND "percentual" > 0) OR ("tipo_valor" <> 'PERCENTUAL_FATURAMENTO' AND "valor" > 0)`,
)
@Index('IDX_despesas_recorrentes_empresa_situacao', ['empresaId', 'situacao'])
@Index('IDX_despesas_recorrentes_fornecedor', ['fornecedorId'])
export class DespesaRecorrente {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_despesas_recorrentes' })
  id: string;

  @Column({ name: 'empresa_id', type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empresa_id', foreignKeyConstraintName: 'FK_despesas_recorrentes_empresa' })
  empresa: Empresa;

  @Column({ name: 'fornecedor_id', type: 'uuid' })
  fornecedorId: string;

  @ManyToOne(() => Fornecedor, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'fornecedor_id', foreignKeyConstraintName: 'FK_despesas_recorrentes_fornecedor' })
  fornecedor: Fornecedor;

  /** Ex.: "Aluguel da loja". */
  @Column({ length: 120 })
  descricao: string;

  @Column({ type: 'enum', enum: SituacaoDespesa, default: SituacaoDespesa.ATIVA })
  situacao: SituacaoDespesa;

  @Column({ name: 'tipo_valor', type: 'enum', enum: TipoValorDespesa })
  tipoValor: TipoValorDespesa;

  /** Valor fixo, ou a estimativa inicial de uma despesa variável. */
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true, transformer: decimalTransformer })
  valor: number | null;

  /** % sobre o faturamento do mês anterior, no tipo PERCENTUAL_FATURAMENTO. */
  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: decimalTransformer })
  percentual: number | null;

  /** 1 mensal, 2 bimestral, 3 trimestral, 6 semestral, 12 anual. */
  @Column({ name: 'intervalo_meses', type: 'smallint', default: 1 })
  intervaloMeses: number;

  /** 31 vence no último dia de meses mais curtos. */
  @Column({ name: 'dia_vencimento', type: 'smallint' })
  diaVencimento: number;

  @Column({ name: 'ajuste_dia_util', type: 'enum', enum: AjusteDiaUtil, default: AjusteDiaUtil.POSTERGAR })
  ajusteDiaUtil: AjusteDiaUtil;

  /** Competência do primeiro vencimento (AAAA-MM). */
  @Column({ type: 'char', length: 7 })
  inicio: string;

  /** Último vencimento; sem fim, vale até ser encerrada. */
  @Column({ type: 'char', length: 7, nullable: true })
  fim: string | null;

  /** Quantos dias antes do vencimento a conta a pagar é lançada. */
  @Column({ name: 'dias_antecedencia', type: 'smallint', default: 10 })
  diasAntecedencia: number;

  @Column({ name: 'plano_conta_id', type: 'uuid', nullable: true })
  planoContaId: string | null;

  @ManyToOne(() => PlanoConta, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'plano_conta_id', foreignKeyConstraintName: 'FK_despesas_recorrentes_plano_conta' })
  planoConta: PlanoConta | null;

  @Column({ name: 'centro_custo_id', type: 'uuid', nullable: true })
  centroCustoId: string | null;

  @ManyToOne(() => CentroCusto, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'centro_custo_id', foreignKeyConstraintName: 'FK_despesas_recorrentes_centro_custo' })
  centroCusto: CentroCusto | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  observacoes: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}

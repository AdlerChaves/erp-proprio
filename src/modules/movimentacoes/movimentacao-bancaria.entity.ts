import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { decimalTransformer } from '../../common/decimal.transformer';
import { CentroCusto } from '../centros-custo/centro-custo.entity';
import { ContaBancaria } from '../contas-bancarias/conta-bancaria.entity';
import { ContaPagar } from '../contas-pagar/conta-pagar.entity';
import { ContaReceber } from '../contas-receber/conta-receber.entity';
import { Empresa } from '../empresas/empresa.entity';
import { PlanoConta } from '../plano-contas/plano-conta.entity';

export enum TipoMovimentacao {
  ENTRADA = 'ENTRADA',
  SAIDA = 'SAIDA',
}

export enum OrigemMovimentacao {
  /** Gerada pela baixa de uma conta a receber; some com o estorno. */
  CONTA_RECEBER = 'CONTA_RECEBER',
  /** Gerada pela baixa de uma conta a pagar; some com o estorno. */
  CONTA_PAGAR = 'CONTA_PAGAR',
  /** Uma das duas pernas de uma transferência entre contas da empresa. */
  TRANSFERENCIA = 'TRANSFERENCIA',
  /** Lançada direto na conta: tarifas, rendimentos, ajustes. */
  AVULSA = 'AVULSA',
}

/** Entrada ou saída de dinheiro numa conta bancária. O saldo é o saldo inicial mais estas movimentações. */
@Entity('movimentacoes_bancarias')
@Check('CHK_movimentacoes_bancarias_valor', '"valor" > 0')
@Index('IDX_movimentacoes_bancarias_conta_data', ['contaBancariaId', 'data'])
@Index('IDX_movimentacoes_bancarias_empresa_data', ['empresaId', 'data'])
@Index('UQ_movimentacoes_bancarias_conta_receber', ['contaReceberId'], { unique: true })
@Index('UQ_movimentacoes_bancarias_conta_pagar', ['contaPagarId'], { unique: true })
@Index('IDX_movimentacoes_bancarias_transferencia', ['transferenciaId'])
@Index('IDX_movimentacoes_bancarias_plano_conta', ['planoContaId'])
@Index('IDX_movimentacoes_bancarias_centro_custo', ['centroCustoId'])
export class MovimentacaoBancaria {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_movimentacoes_bancarias' })
  id: string;

  @Column({ name: 'empresa_id', type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empresa_id', foreignKeyConstraintName: 'FK_movimentacoes_bancarias_empresa' })
  empresa: Empresa;

  @Column({ name: 'conta_bancaria_id', type: 'uuid' })
  contaBancariaId: string;

  @ManyToOne(() => ContaBancaria, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'conta_bancaria_id', foreignKeyConstraintName: 'FK_movimentacoes_bancarias_conta_bancaria' })
  contaBancaria: ContaBancaria;

  @Column({ type: 'date' })
  data: string;

  @Column({ type: 'enum', enum: TipoMovimentacao })
  tipo: TipoMovimentacao;

  /** Sempre positivo; o sentido vem do tipo. */
  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: decimalTransformer })
  valor: number;

  @Column({ length: 255 })
  descricao: string;

  @Column({ type: 'enum', enum: OrigemMovimentacao })
  origem: OrigemMovimentacao;

  @Column({ name: 'conta_receber_id', type: 'uuid', nullable: true })
  contaReceberId: string | null;

  @ManyToOne(() => ContaReceber, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'conta_receber_id', foreignKeyConstraintName: 'FK_movimentacoes_bancarias_conta_receber' })
  contaReceber: ContaReceber | null;

  @Column({ name: 'conta_pagar_id', type: 'uuid', nullable: true })
  contaPagarId: string | null;

  @ManyToOne(() => ContaPagar, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'conta_pagar_id', foreignKeyConstraintName: 'FK_movimentacoes_bancarias_conta_pagar' })
  contaPagar: ContaPagar | null;

  /** Igual nas duas pernas de uma mesma transferência. */
  @Column({ name: 'transferencia_id', type: 'uuid', nullable: true })
  transferenciaId: string | null;

  /** Categoria, só em movimentações avulsas; nas baixas a categoria fica na conta. */
  @Column({ name: 'plano_conta_id', type: 'uuid', nullable: true })
  planoContaId: string | null;

  @ManyToOne(() => PlanoConta, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'plano_conta_id', foreignKeyConstraintName: 'FK_movimentacoes_bancarias_plano_conta' })
  planoConta: PlanoConta | null;

  @Column({ name: 'centro_custo_id', type: 'uuid', nullable: true })
  centroCustoId: string | null;

  @ManyToOne(() => CentroCusto, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'centro_custo_id', foreignKeyConstraintName: 'FK_movimentacoes_bancarias_centro_custo' })
  centroCusto: CentroCusto | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;
}

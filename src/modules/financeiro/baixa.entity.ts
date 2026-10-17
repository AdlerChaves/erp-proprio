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
import { ContaBancaria } from '../contas-bancarias/conta-bancaria.entity';
import { ContaPagar } from '../contas-pagar/conta-pagar.entity';
import { ContaReceber } from '../contas-receber/conta-receber.entity';
import { Empresa } from '../empresas/empresa.entity';

const numerico = { type: 'numeric' as const, precision: 14, scale: 2, transformer: decimalTransformer };

/**
 * Um pagamento, total ou parcial, de uma conta a receber ou a pagar.
 * valor é o principal abatido do saldo da conta; valorTotal é o que de fato entrou ou saiu da conta bancária.
 */
@Entity('baixas')
@Check('CHK_baixas_uma_conta', 'num_nonnulls("conta_receber_id", "conta_pagar_id") = 1')
@Check('CHK_baixas_valores', '"valor" > 0 AND "juros" >= 0 AND "multa" >= 0 AND "desconto" >= 0 AND "valor_total" > 0')
@Check('CHK_baixas_total', '"valor_total" = "valor" + "juros" + "multa" - "desconto"')
@Index('IDX_baixas_conta_receber', ['contaReceberId'])
@Index('IDX_baixas_conta_pagar', ['contaPagarId'])
@Index('IDX_baixas_conta_bancaria', ['contaBancariaId'])
@Index('IDX_baixas_empresa_data', ['empresaId', 'data'])
export class Baixa {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_baixas' })
  id: string;

  @Column({ name: 'empresa_id', type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empresa_id', foreignKeyConstraintName: 'FK_baixas_empresa' })
  empresa: Empresa;

  @Column({ name: 'conta_receber_id', type: 'uuid', nullable: true })
  contaReceberId: string | null;

  @ManyToOne(() => ContaReceber, (conta) => conta.baixas, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'conta_receber_id', foreignKeyConstraintName: 'FK_baixas_conta_receber' })
  contaReceber: ContaReceber | null;

  @Column({ name: 'conta_pagar_id', type: 'uuid', nullable: true })
  contaPagarId: string | null;

  @ManyToOne(() => ContaPagar, (conta) => conta.baixas, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'conta_pagar_id', foreignKeyConstraintName: 'FK_baixas_conta_pagar' })
  contaPagar: ContaPagar | null;

  /** Só é nula em baixas migradas de antes de a conta bancária ser obrigatória. */
  @Column({ name: 'conta_bancaria_id', type: 'uuid', nullable: true })
  contaBancariaId: string | null;

  @ManyToOne(() => ContaBancaria, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'conta_bancaria_id', foreignKeyConstraintName: 'FK_baixas_conta_bancaria' })
  contaBancaria: ContaBancaria | null;

  @Column({ type: 'date' })
  data: string;

  @Column(numerico)
  valor: number;

  @Column(numerico)
  juros: number;

  @Column(numerico)
  multa: number;

  @Column(numerico)
  desconto: number;

  @Column({ ...numerico, name: 'valor_total' })
  valorTotal: number;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  /**
   * Ordem de gravação, gerada pelo banco: desempata baixas do mesmo dia sem depender do relógio.
   * Carregável porque o TypeORM não ordena relações por colunas ocultas; o serviço a remove da resposta.
   */
  @Column({ type: 'bigint' })
  @Generated('increment')
  seq: string;
}

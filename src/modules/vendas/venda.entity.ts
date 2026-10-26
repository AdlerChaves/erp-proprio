import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../../common/decimal.transformer';
import { CentroCusto } from '../centros-custo/centro-custo.entity';
import { Cliente } from '../clientes/cliente.entity';
import { Empresa } from '../empresas/empresa.entity';
import { PlanoConta } from '../plano-contas/plano-conta.entity';
import { ItemVenda } from './item-venda.entity';

export enum StatusVenda {
  /** Proposta ao cliente; não mexe em estoque nem no financeiro. */
  ORCAMENTO = 'ORCAMENTO',
  /** Aprovado pelo cliente; a quantidade fica reservada no estoque. */
  PEDIDO = 'PEDIDO',
  /** Estoque baixado e contas a receber geradas. */
  FATURADA = 'FATURADA',
  CANCELADA = 'CANCELADA',
}

/** O que o serviço do orçamento cobre; aparece nas condições gerais do PDF. */
export enum EscopoServico {
  MAO_DE_OBRA = 'MAO_DE_OBRA',
  MATERIAL_INCLUSO = 'MATERIAL_INCLUSO',
}

@Entity('vendas')
@Check('CHK_vendas_parcelas', '"parcelas" BETWEEN 1 AND 120')
@Check('CHK_vendas_total', '"total" >= 0')
@Index('UQ_vendas_empresa_numero', ['empresaId', 'numero'], { unique: true })
@Index('IDX_vendas_empresa_status', ['empresaId', 'status'])
@Index('IDX_vendas_cliente', ['clienteId'])
export class Venda {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_vendas' })
  id: string;

  @Column({ name: 'empresa_id', type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empresa_id', foreignKeyConstraintName: 'FK_vendas_empresa' })
  empresa: Empresa;

  /** Sequencial por empresa: 1, 2, 3... */
  @Column({ type: 'integer' })
  numero: number;

  @Column({ name: 'cliente_id', type: 'uuid' })
  clienteId: string;

  @ManyToOne(() => Cliente, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cliente_id', foreignKeyConstraintName: 'FK_vendas_cliente' })
  cliente: Cliente;

  @Column({ type: 'enum', enum: StatusVenda, default: StatusVenda.ORCAMENTO })
  status: StatusVenda;

  @Column({ name: 'data_emissao', type: 'date' })
  dataEmissao: string;

  @Column({ name: 'data_faturamento', type: 'date', nullable: true })
  dataFaturamento: string | null;

  /** Condição de pagamento: parcelas mensais a partir do primeiro vencimento. */
  @Column({ type: 'smallint', default: 1 })
  parcelas: number;

  /** Sem data, vence no dia do faturamento (à vista). */
  @Column({ name: 'primeiro_vencimento', type: 'date', nullable: true })
  primeiroVencimento: string | null;

  /** Categoria de receita das contas a receber geradas. */
  @Column({ name: 'plano_conta_id', type: 'uuid', nullable: true })
  planoContaId: string | null;

  @ManyToOne(() => PlanoConta, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'plano_conta_id', foreignKeyConstraintName: 'FK_vendas_plano_conta' })
  planoConta: PlanoConta | null;

  @Column({ name: 'centro_custo_id', type: 'uuid', nullable: true })
  centroCustoId: string | null;

  @ManyToOne(() => CentroCusto, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'centro_custo_id', foreignKeyConstraintName: 'FK_vendas_centro_custo' })
  centroCusto: CentroCusto | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  observacoes: string | null;

  /** Sem escopo, o PDF não diz se o material está incluso. */
  @Column({ name: 'escopo_servico', type: 'enum', enum: EscopoServico, nullable: true })
  escopoServico: EscopoServico | null;

  /** Mostra no orçamento em PDF a tabela de parcelamento no cartão (se a empresa a usa). */
  @Column({ name: 'exibir_parcelamento', default: true })
  exibirParcelamento: boolean;

  /** Soma dos itens. */
  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: decimalTransformer })
  total: number;

  @OneToMany(() => ItemVenda, (item) => item.venda)
  itens: ItemVenda[];

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}

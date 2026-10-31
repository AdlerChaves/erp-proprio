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
import { Produto } from '../produtos/produto.entity';
import { Venda } from '../vendas/venda.entity';

export enum SituacaoContrato {
  /** Gera a cobrança todo mês. */
  ATIVO = 'ATIVO',
  /** Suspenso pelo usuário; volta a gerar ao ser reativado. */
  PAUSADO = 'PAUSADO',
  /** Terminou; não gera mais nada. */
  ENCERRADO = 'ENCERRADO',
}

/**
 * Contrato de cobrança recorrente: os mesmos itens todo mês, para o mesmo cliente. Em cada mês de vigência
 * (competência), o ERP gera a venda, fatura (o que lança a conta a receber) e, se pedido, gera e transmite a NFS-e.
 * Competências são "AAAA-MM".
 */
@Entity('contratos')
@Check('CHK_contratos_dias', '"dia_faturamento" BETWEEN 1 AND 28 AND "dia_vencimento" BETWEEN 1 AND 28')
@Check('CHK_contratos_vigencia', '"fim" IS NULL OR "fim" >= "inicio"')
@Check('CHK_contratos_transmitir', 'NOT "transmitir_nfse" OR "emitir_nfse"')
@Index('UQ_contratos_empresa_numero', ['empresaId', 'numero'], { unique: true })
@Index('IDX_contratos_empresa_situacao', ['empresaId', 'situacao'])
@Index('IDX_contratos_cliente', ['clienteId'])
export class Contrato {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_contratos' })
  id: string;

  @Column({ name: 'empresa_id', type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empresa_id', foreignKeyConstraintName: 'FK_contratos_empresa' })
  empresa: Empresa;

  /** Sequencial por empresa: 1, 2, 3... */
  @Column({ type: 'integer' })
  numero: number;

  @Column({ name: 'cliente_id', type: 'uuid' })
  clienteId: string;

  @ManyToOne(() => Cliente, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cliente_id', foreignKeyConstraintName: 'FK_contratos_cliente' })
  cliente: Cliente;

  /** Ex.: "Suporte técnico mensal". */
  @Column({ length: 120 })
  descricao: string;

  @Column({ type: 'enum', enum: SituacaoContrato, default: SituacaoContrato.ATIVO })
  situacao: SituacaoContrato;

  /** Primeira competência cobrada (AAAA-MM). */
  @Column({ type: 'char', length: 7 })
  inicio: string;

  /** Última competência cobrada; sem fim, vale até ser encerrado. */
  @Column({ type: 'char', length: 7, nullable: true })
  fim: string | null;

  /** Dia do mês em que a venda é gerada e faturada (até 28, para existir em todo mês). */
  @Column({ name: 'dia_faturamento', type: 'smallint' })
  diaFaturamento: number;

  /** Dia do vencimento; antes do dia do faturamento, vence no mês seguinte. */
  @Column({ name: 'dia_vencimento', type: 'smallint' })
  diaVencimento: number;

  /** Gera a DPS dos serviços depois de faturar. */
  @Column({ name: 'emitir_nfse', default: false })
  emitirNfse: boolean;

  /** Também transmite a nota ao Emissor Nacional (exige emitirNfse). */
  @Column({ name: 'transmitir_nfse', default: false })
  transmitirNfse: boolean;

  @Column({ name: 'plano_conta_id', type: 'uuid', nullable: true })
  planoContaId: string | null;

  @ManyToOne(() => PlanoConta, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'plano_conta_id', foreignKeyConstraintName: 'FK_contratos_plano_conta' })
  planoConta: PlanoConta | null;

  @Column({ name: 'centro_custo_id', type: 'uuid', nullable: true })
  centroCustoId: string | null;

  @ManyToOne(() => CentroCusto, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'centro_custo_id', foreignKeyConstraintName: 'FK_contratos_centro_custo' })
  centroCusto: CentroCusto | null;

  /** Vai para as observações de cada venda (e, por elas, para a descrição da NFS-e). */
  @Column({ type: 'varchar', length: 300, nullable: true })
  observacoes: string | null;

  /** Valor mensal: soma dos itens. */
  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: decimalTransformer })
  valor: number;

  @OneToMany(() => ItemContrato, (item) => item.contrato)
  itens: ItemContrato[];

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}

@Entity('itens_contrato')
@Index('IDX_itens_contrato_contrato', ['contratoId'])
export class ItemContrato {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_itens_contrato' })
  id: string;

  @Column({ name: 'contrato_id', type: 'uuid' })
  contratoId: string;

  @ManyToOne(() => Contrato, (c) => c.itens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contrato_id', foreignKeyConstraintName: 'FK_itens_contrato_contrato' })
  contrato: Contrato;

  @Column({ name: 'produto_id', type: 'uuid' })
  produtoId: string;

  @ManyToOne(() => Produto, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'produto_id', foreignKeyConstraintName: 'FK_itens_contrato_produto' })
  produto: Produto;

  @Column({ type: 'smallint' })
  ordem: number;

  @Column({ type: 'numeric', precision: 14, scale: 3, transformer: decimalTransformer })
  quantidade: number;

  /** Preço combinado no contrato; não acompanha o preço de venda do cadastro. */
  @Column({ name: 'preco_unitario', type: 'numeric', precision: 14, scale: 2, transformer: decimalTransformer })
  precoUnitario: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0, transformer: decimalTransformer })
  desconto: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: decimalTransformer })
  total: number;
}

export enum SituacaoGeracao {
  /** Em andamento (ou interrompida no meio; é retomada depois de alguns minutos). */
  PROCESSANDO = 'PROCESSANDO',
  /** Venda faturada e, se pedido, a NFS-e gerada (a transmissão pode ter ficado pendente na própria nota). */
  CONCLUIDA = 'CONCLUIDA',
  /** Parou em alguma etapa; o erro diz qual. Tentar de novo retoma de onde parou. */
  FALHA = 'FALHA',
}

/** A cobrança de um contrato numa competência: no máximo uma por mês, o que impede gerar em dobro. */
@Entity('geracoes_contrato')
@Index('UQ_geracoes_contrato_competencia', ['contratoId', 'competencia'], { unique: true })
@Index('IDX_geracoes_contrato_empresa_competencia', ['empresaId', 'competencia'])
export class GeracaoContrato {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_geracoes_contrato' })
  id: string;

  @Column({ name: 'empresa_id', type: 'uuid' })
  empresaId: string;

  @Column({ name: 'contrato_id', type: 'uuid' })
  contratoId: string;

  @ManyToOne(() => Contrato, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contrato_id', foreignKeyConstraintName: 'FK_geracoes_contrato_contrato' })
  contrato: Contrato;

  @Column({ type: 'char', length: 7 })
  competencia: string;

  @Column({ type: 'enum', enum: SituacaoGeracao, default: SituacaoGeracao.PROCESSANDO })
  situacao: SituacaoGeracao;

  @Column({ name: 'venda_id', type: 'uuid', nullable: true })
  vendaId: string | null;

  @ManyToOne(() => Venda, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'venda_id', foreignKeyConstraintName: 'FK_geracoes_contrato_venda' })
  venda: Venda | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  erro: string | null;

  /** true quando quem gerou foi o agendador, não uma pessoa. */
  @Column({ default: false })
  automatica: boolean;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}

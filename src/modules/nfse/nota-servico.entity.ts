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
import { decimalTransformer } from '../../common/decimal.transformer';
import { Cliente } from '../clientes/cliente.entity';
import { Empresa } from '../empresas/empresa.entity';
import { Venda } from '../vendas/venda.entity';

export enum StatusNotaServico {
  /** DPS gerada; falta emitir no portal da prefeitura e registrar o número da NFS-e. */
  PENDENTE = 'PENDENTE',
  EMITIDA = 'EMITIDA',
  CANCELADA = 'CANCELADA',
}

/**
 * Nota fiscal de serviço (NFS-e) de uma venda, a partir da DPS no leiaute nacional.
 * Uma venda gera uma nota por código de tributação nacional, porque cada NFS-e descreve um único serviço.
 */
@Entity('notas_servico')
@Index('UQ_notas_servico_empresa_serie_numero', ['empresaId', 'serie', 'numeroDps'], { unique: true })
@Index('UQ_notas_servico_empresa_numero_nfse', ['empresaId', 'numeroNfse'], { unique: true, where: '"numero_nfse" IS NOT NULL' })
@Index('IDX_notas_servico_venda', ['vendaId'])
@Index('IDX_notas_servico_empresa_status', ['empresaId', 'status'])
export class NotaServico {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_notas_servico' })
  id: string;

  @Column({ name: 'empresa_id', type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empresa_id', foreignKeyConstraintName: 'FK_notas_servico_empresa' })
  empresa: Empresa;

  @Column({ name: 'venda_id', type: 'uuid', nullable: true })
  vendaId: string | null;

  @ManyToOne(() => Venda, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'venda_id', foreignKeyConstraintName: 'FK_notas_servico_venda' })
  venda: Venda | null;

  @Column({ name: 'cliente_id', type: 'uuid' })
  clienteId: string;

  @ManyToOne(() => Cliente, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cliente_id', foreignKeyConstraintName: 'FK_notas_servico_cliente' })
  cliente: Cliente;

  @Column({ type: 'enum', enum: StatusNotaServico, default: StatusNotaServico.PENDENTE })
  status: StatusNotaServico;

  /** 1 = produção, 2 = homologação (tpAmb da DPS). */
  @Column({ type: 'smallint' })
  ambiente: number;

  @Column({ length: 5 })
  serie: string;

  /** Número da DPS, sequencial por empresa; nunca se repete, nem depois de cancelada. */
  @Column({ name: 'numero_dps', type: 'integer' })
  numeroDps: number;

  @Column({ name: 'data_competencia', type: 'date' })
  dataCompetencia: string;

  /** dhEmi da DPS. */
  @Column({ name: 'gerada_em', type: 'timestamptz' })
  geradaEm: Date;

  @Column({ name: 'codigo_tributacao_nacional', length: 6 })
  codigoTributacaoNacional: string;

  @Column({ name: 'codigo_nbs', type: 'varchar', length: 9, nullable: true })
  codigoNbs: string | null;

  /** Município onde o serviço foi prestado (código IBGE). */
  @Column({ name: 'municipio_prestacao', length: 7 })
  municipioPrestacao: string;

  @Column({ type: 'varchar', length: 2000 })
  descricao: string;

  /** Valor bruto dos serviços (vServ). */
  @Column({ name: 'valor_servicos', type: 'numeric', precision: 14, scale: 2, transformer: decimalTransformer })
  valorServicos: number;

  /** Descontos dados nos itens (vDescIncond). */
  @Column({ name: 'desconto_incondicionado', type: 'numeric', precision: 14, scale: 2, default: 0, transformer: decimalTransformer })
  descontoIncondicionado: number;

  @Column({ name: 'iss_retido', default: false })
  issRetido: boolean;

  /** Alíquota do ISS (%); no Simples, só vai na DPS quando o ISS é retido pelo tomador. */
  @Column({ name: 'aliquota_iss', type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: decimalTransformer })
  aliquotaIss: number | null;

  /** DPS no leiaute nacional, já validada contra o XSD oficial. */
  @Column({ name: 'xml_dps', type: 'text', select: false })
  xmlDps: string;

  @Column({ name: 'numero_nfse', type: 'varchar', length: 15, nullable: true })
  numeroNfse: string | null;

  @Column({ name: 'codigo_verificacao', type: 'varchar', length: 60, nullable: true })
  codigoVerificacao: string | null;

  /** Chave de acesso de 50 posições da NFS-e nacional, se o portal informar. */
  @Column({ name: 'chave_acesso', type: 'varchar', length: 50, nullable: true })
  chaveAcesso: string | null;

  @Column({ name: 'data_emissao_nfse', type: 'date', nullable: true })
  dataEmissaoNfse: string | null;

  @Column({ name: 'motivo_cancelamento', type: 'varchar', length: 255, nullable: true })
  motivoCancelamento: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}

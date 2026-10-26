import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../../common/decimal.transformer';
import type { EnderecoDto as Endereco } from '../../common/endereco.dto';

export enum RegimeTributario {
  SIMPLES_NACIONAL = 'SIMPLES_NACIONAL',
  MEI = 'MEI',
  LUCRO_PRESUMIDO = 'LUCRO_PRESUMIDO',
  LUCRO_REAL = 'LUCRO_REAL',
}

/** Como a empresa apresenta orçamentos e pedidos em PDF. */
export interface ConfigProposta {
  /** Até 4 frases curtas numa faixa abaixo do cabeçalho ("Garantia de 12 meses"). */
  destaques: string[];
  /** Validade do orçamento em dias a partir da emissão; null não mostra validade. */
  validadeDias: number | null;
  prazoEntrega: string | null;
  garantia: string | null;
  /** Condições comerciais em texto livre. */
  condicoes: string | null;
  /** Mostra no orçamento a tabela de parcelamento no cartão. */
  simularCartao: boolean;
  /** Juros compostos ao mês (tabela Price), em %, nas parcelas acima de parcelasSemJuros. */
  jurosCartao: number;
  parcelasCartao: number;
  parcelasSemJuros: number;
}

export const PROPOSTA_PADRAO: ConfigProposta = {
  destaques: [],
  validadeDias: 10,
  prazoEntrega: null,
  garantia: null,
  condicoes: null,
  simularCartao: true,
  jurosCartao: 2,
  parcelasCartao: 12,
  parcelasSemJuros: 1,
};

/** Ambiente da NFS-e nacional (tpAmb). */
export enum AmbienteNfse {
  PRODUCAO = 1,
  HOMOLOGACAO = 2,
}

@Entity('empresas')
@Unique('UQ_empresas_cnpj', ['cnpj'])
export class Empresa {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_empresas' })
  id: string;

  @Column({ name: 'razao_social', length: 150 })
  razaoSocial: string;

  @Column({ name: 'nome_fantasia', type: 'varchar', length: 150, nullable: true })
  nomeFantasia: string | null;

  // Somente dígitos.
  @Column({ length: 14 })
  cnpj: string;

  @Column({ default: true })
  ativo: boolean;

  // Contato: aparece no cabeçalho de orçamentos e pedidos.

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefone: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email: string | null;

  @Column({ type: 'jsonb', nullable: true })
  endereco: Endereco | null;

  // Dados fiscais, usados na nota de serviço (DPS).

  @Column({ name: 'inscricao_municipal', type: 'varchar', length: 15, nullable: true })
  inscricaoMunicipal: string | null;

  /** Município do cadastro (código IBGE): é o município emissor da NFS-e. */
  @Column({ name: 'codigo_municipio', type: 'varchar', length: 7, nullable: true })
  codigoMunicipio: string | null;

  @Column({ name: 'regime_tributario', type: 'enum', enum: RegimeTributario, nullable: true })
  regimeTributario: RegimeTributario | null;

  /**
   * Para ME/EPP do Simples (regApTribSN): 1 = federais e ISS pelo Simples; 2 = federais pelo Simples e ISS
   * pela prefeitura; 3 = tudo fora do Simples (sublimite ultrapassado).
   */
  @Column({ name: 'regime_apuracao_simples', type: 'smallint', default: 1 })
  regimeApuracaoSimples: number;

  /** Percentual aproximado do total de tributos do Simples (pTotTribSN), conforme a faixa do anexo. */
  @Column({ name: 'aliquota_simples', type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: decimalTransformer })
  aliquotaSimples: number | null;

  /** Série da DPS: 00001 a 49999 para aplicativo próprio. */
  @Column({ name: 'nfse_serie', length: 5, default: '1' })
  nfseSerie: string;

  @Column({ name: 'nfse_ambiente', type: 'smallint', default: AmbienteNfse.HOMOLOGACAO })
  nfseAmbiente: AmbienteNfse;

  /**
   * Número mínimo de orçamentos e vendas (a numeração é a mesma: o orçamento aprovado vira pedido e venda).
   * O próximo é o maior entre este e o último usado mais um, então nunca se repete.
   */
  @Column({ name: 'numero_inicial_vendas', type: 'integer', default: 1 })
  numeroInicialVendas: number;

  /** Nulo (empresa que nunca configurou) ou incompleto (campo novo) é completado com o padrão na leitura. */
  @Column({
    type: 'jsonb',
    nullable: true,
    transformer: { from: (v: Partial<ConfigProposta> | null) => ({ ...PROPOSTA_PADRAO, ...v }), to: (v?: ConfigProposta) => v },
  })
  proposta: ConfigProposta;

  /** Logo em data URL (PNG ou JPEG). Fora das consultas comuns: é carregado só para o PDF e a tela da empresa. */
  @Column({ type: 'text', nullable: true, select: false })
  logo?: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}

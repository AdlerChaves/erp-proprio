/** Formatos das respostas da API usados pelas telas. */

export type Perfil = 'ADMIN' | 'FINANCEIRO' | 'VENDAS' | 'CONSULTA';

export interface EmpresaAcessivel {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  perfil: Perfil;
}

export interface Me {
  usuario: { id: string; nome: string; email: string };
  empresaId: string;
  perfil: Perfil;
  empresas: EmpresaAcessivel[];
  csrfToken: string;
}

export interface SessaoEntregue {
  empresaId: string;
  csrfToken: string;
}

export interface Endereco {
  cep: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  codigoMunicipio: string;
}

export interface Pessoa {
  id: string;
  nome: string;
  /** Só cliente pode não ter (proposta antes de receber os documentos). */
  documento: string | null;
  email: string | null;
  telefone: string | null;
  /** Só clientes: dados do tomador na nota de serviço. */
  inscricaoMunicipal?: string | null;
  endereco?: Endereco | null;
  ativo: boolean;
}

export type TipoPlanoConta = 'RECEITA' | 'DESPESA';

export interface PlanoConta {
  id: string;
  codigo: string;
  nome: string;
  tipo: TipoPlanoConta;
  contaPaiId: string | null;
  aceitaLancamento: boolean;
  ativo: boolean;
}

export interface CentroCusto {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
}

export type TipoContaBancaria = 'CORRENTE' | 'POUPANCA' | 'INVESTIMENTO' | 'CAIXA';

export interface ContaBancaria {
  id: string;
  nome: string;
  tipo: TipoContaBancaria;
  banco: string | null;
  agencia: string | null;
  numero: string | null;
  saldoInicial: number;
  dataSaldoInicial: string;
  ativo: boolean;
}

export type StatusConta = 'ABERTA' | 'PARCIAL' | 'PAGA' | 'CANCELADA';

export interface Baixa {
  id: string;
  data: string;
  valor: number;
  juros: number;
  multa: number;
  desconto: number;
  valorTotal: number;
  contaBancariaId: string | null;
  contaBancaria: ContaBancaria | null;
}

export interface ContaFinanceira {
  id: string;
  descricao: string;
  valor: number;
  dataEmissao: string;
  dataVencimento: string;
  status: StatusConta;
  planoContaId: string | null;
  planoConta: PlanoConta | null;
  centroCustoId: string | null;
  centroCusto: CentroCusto | null;
  parcelamentoId: string | null;
  parcela: number | null;
  totalParcelas: number | null;
  baixas: Baixa[];
  valorBaixado: number;
  saldo: number;
  clienteId?: string;
  cliente?: Pessoa;
  fornecedorId?: string;
  fornecedor?: Pessoa;
  /** Conta a pagar que é a fatura de um cartão: mantida pelo cartão, não editada à mão. */
  faturaCartaoId?: string | null;
}

export interface Saldos {
  data: string;
  contas: {
    contaBancaria: { id: string; nome: string; tipo: TipoContaBancaria; ativo: boolean };
    saldo: number;
  }[];
  total: number;
}

export interface FluxoCaixa {
  de: string;
  ate: string;
  saldoInicial: number;
  periodos: {
    periodo: string;
    /** Saldo inicial de contas bancárias abertas no período. */
    aberturas: number;
    realizado: { entradas: number; saidas: number };
    previsto: { entradas: number; saidas: number };
    saldo: number;
  }[];
  saldoFinal: number;
  emAtraso: { receber: number; pagar: number };
}

export type RegimeTributario = 'SIMPLES_NACIONAL' | 'MEI' | 'LUCRO_PRESUMIDO' | 'LUCRO_REAL';

/** Como os orçamentos e pedidos em PDF são apresentados. */
export interface ConfigProposta {
  destaques: string[];
  validadeDias: number | null;
  prazoEntrega: string | null;
  garantia: string | null;
  condicoes: string | null;
  simularCartao: boolean;
  /** Juros compostos ao mês, em %. */
  jurosCartao: number;
  parcelasCartao: number;
  parcelasSemJuros: number;
}

export interface Empresa {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpj: string;
  ativo: boolean;
  inscricaoMunicipal: string | null;
  codigoMunicipio: string | null;
  regimeTributario: RegimeTributario | null;
  regimeApuracaoSimples: number;
  aliquotaSimples: number | null;
  nfseSerie: string;
  /** 1 = produção, 2 = homologação. */
  nfseAmbiente: 1 | 2;
  /** Certificado A1 instalado para transmitir a NFS-e: titular e fim da validade. */
  certificadoTitular: string | null;
  certificadoValidade: string | null;
  /** Orçamentos e vendas são numerados a partir deste número (ou do último usado, se for maior). */
  numeroInicialVendas: number;
  proposta: ConfigProposta;
  telefone: string | null;
  email: string | null;
  endereco: Endereco | null;
}

export type TipoProduto = 'PRODUTO' | 'SERVICO';

export interface Produto {
  id: string;
  codigo: string;
  descricao: string;
  tipo: TipoProduto;
  unidade: string;
  precoVenda: number;
  custo: number | null;
  ncm: string | null;
  codigoServico: string | null;
  codigoTributacaoNacional: string | null;
  codigoNbs: string | null;
  /** Saldo físico; só produtos controlam estoque. */
  estoque: number;
  ativo: boolean;
}

export type TipoMovimentacao = 'ENTRADA' | 'SAIDA';
export type OrigemMovimentacao = 'CONTA_RECEBER' | 'CONTA_PAGAR' | 'TRANSFERENCIA' | 'AVULSA';

export interface Movimentacao {
  id: string;
  contaBancariaId: string;
  data: string;
  tipo: TipoMovimentacao;
  valor: number;
  descricao: string;
  origem: OrigemMovimentacao;
  baixaId: string | null;
  transferenciaId: string | null;
  planoContaId: string | null;
  planoConta: PlanoConta | null;
  centroCustoId: string | null;
  centroCusto: CentroCusto | null;
}

export interface Extrato {
  contaBancaria: { id: string; nome: string };
  de: string;
  ate: string;
  saldoAnterior: number;
  movimentacoes: (Movimentacao & { saldo: number })[];
  saldoFinal: number;
}

export type RegimeDre = 'competencia' | 'caixa';

export interface Dre {
  de: string;
  ate: string;
  regime: RegimeDre;
  centroCustoId: string | null;
  contas: { id: string; codigo: string; nome: string; tipo: TipoPlanoConta; nivel: number; valor: number }[];
  semCategoria: { receitas: number; despesas: number };
  receitas: number;
  despesas: number;
  resultado: number;
}

/** De onde vem um lançamento do resultado. */
export type OrigemLancamento = 'CONTA_RECEBER' | 'CONTA_PAGAR' | 'CARTAO' | 'FATURA' | 'AVULSA';

export interface LancamentoResultado {
  data: string;
  tipo: TipoPlanoConta;
  origem: OrigemLancamento;
  referencia: string;
  descricao: string;
  pessoa: string | null;
  categoria: { codigo: string; nome: string } | null;
  valor: number;
}

export interface ResumoCentroCusto extends Omit<Dre, 'centroCustoId'> {
  centroCusto: { id: string; nome: string; descricao: string | null; ativo: boolean };
  /** Lucro sobre a receita, em %; null sem receita no período. */
  margem: number | null;
  /** Saldo das contas deste centro ainda em aberto, de qualquer vencimento. */
  emAberto: { receber: number; pagar: number };
  totalLancamentos: number;
  lancamentos: LancamentoResultado[];
}

export interface UsuarioDaEmpresa {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
}

export interface RegistroAuditoria {
  id: string;
  empresaId: string | null;
  usuarioId: string | null;
  acao: string;
  recurso: string | null;
  recursoId: string | null;
  dados: Record<string, unknown> | null;
  ip: string | null;
  criadoEm: string;
}

export interface PaginaAuditoria {
  itens: RegistroAuditoria[];
  total: number;
  limite: number;
  deslocamento: number;
}

export type StatusVenda = 'ORCAMENTO' | 'PEDIDO' | 'FATURADA' | 'CANCELADA';
export type StatusCompra = 'PEDIDO' | 'RECEBIDA' | 'CANCELADA';

/** Campos comuns a vendas e compras. */
interface DocumentoComercial {
  id: string;
  numero: number;
  dataEmissao: string;
  parcelas: number;
  primeiroVencimento: string | null;
  planoContaId: string | null;
  planoConta?: PlanoConta | null;
  centroCustoId: string | null;
  centroCusto?: CentroCusto | null;
  observacoes: string | null;
  total: number;
  /** Contas geradas; só vem no detalhe. */
  contas?: ContaFinanceira[];
  /** Avisos de estoque negativo, nas respostas de faturamento e cancelamento. */
  avisos?: string[];
}

export interface ItemVenda {
  id: string;
  produtoId: string;
  produto?: Produto;
  ordem: number;
  descricao: string;
  quantidade: number;
  precoUnitario: number;
  desconto: number;
  total: number;
}

/** O que o serviço do orçamento cobre; aparece nas condições gerais do PDF. */
export type EscopoServico = 'MAO_DE_OBRA' | 'MATERIAL_INCLUSO';

export interface Venda extends DocumentoComercial {
  clienteId: string;
  cliente: Pessoa;
  status: StatusVenda;
  dataFaturamento: string | null;
  escopoServico: EscopoServico | null;
  /** Mostra no orçamento em PDF a tabela de parcelamento no cartão. */
  exibirParcelamento: boolean;
  itens?: ItemVenda[];
}

export interface ItemCompra {
  id: string;
  produtoId: string;
  produto?: Produto;
  ordem: number;
  descricao: string;
  quantidade: number;
  custoUnitario: number;
  total: number;
}

export interface Compra extends DocumentoComercial {
  fornecedorId: string;
  fornecedor: Pessoa;
  status: StatusCompra;
  dataRecebimento: string | null;
  itens?: ItemCompra[];
}

export interface PosicaoEstoque {
  itens: {
    produto: { id: string; codigo: string; descricao: string; unidade: string; ativo: boolean };
    estoque: number;
    reservado: number;
    disponivel: number;
    custoMedio: number | null;
    valorEstoque: number;
  }[];
  valorTotal: number;
}

export type OrigemMovimentacaoEstoque = 'COMPRA' | 'VENDA' | 'AJUSTE' | 'ESTORNO_COMPRA' | 'ESTORNO_VENDA';

export interface MovimentacaoEstoque {
  id: string;
  produtoId: string;
  data: string;
  tipo: TipoMovimentacao;
  origem: OrigemMovimentacaoEstoque;
  quantidade: number;
  custoUnitario: number;
  saldo: number;
  descricao: string;
  vendaId: string | null;
  compraId: string | null;
}

export interface Municipio {
  codigo: string;
  nome: string;
  uf: string;
}

export interface ServicoNacional {
  codigo: string;
  descricao: string;
}

export type StatusNotaServico = 'PENDENTE' | 'EMITIDA' | 'CANCELADA';

export interface NotaServico {
  id: string;
  vendaId: string | null;
  venda: Venda | null;
  clienteId: string;
  cliente: Pessoa;
  status: StatusNotaServico;
  ambiente: 1 | 2;
  serie: string;
  numeroDps: number;
  dataCompetencia: string;
  geradaEm: string;
  codigoTributacaoNacional: string;
  codigoNbs: string | null;
  municipioPrestacao: string;
  descricao: string;
  valorServicos: number;
  descontoIncondicionado: number;
  issRetido: boolean;
  aliquotaIss: number | null;
  numeroNfse: string | null;
  codigoVerificacao: string | null;
  chaveAcesso: string | null;
  dataEmissaoNfse: string | null;
  motivoCancelamento: string | null;
  /** Motivo da última transmissão recusada ou sem resposta; some quando a nota é emitida. */
  erroTransmissao: string | null;
  /** Emitida pelo ERP no Emissor Nacional: tem XML, DANFSe e é cancelada por evento lá. */
  emitidaNoErp: boolean;
}

/** Dados públicos do CNPJ (Receita Federal), já no formato do cadastro. */
/** Endereço do CEP (ViaCEP ou BrasilAPI, pela nossa API). */
export interface DadosCep {
  cep: string;
  /** Vazios em CEP geral de município. */
  logradouro: string;
  bairro: string;
  codigoMunicipio: string | null;
  municipio: { nome: string; uf: string } | null;
  fonte: string;
}

export interface DadosCnpj {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  situacao: string;
  ativa: boolean;
  email: string | null;
  telefone: string | null;
  endereco: Endereco & { complemento: string; codigoMunicipio: string | null };
  municipio: { nome: string; uf: string } | null;
  simplesNacional: boolean | null;
  mei: boolean | null;
  fonte: string;
  consultadoEm: string;
}

export interface CartaoCredito {
  id: string;
  nome: string;
  final: string | null;
  contaBancariaId: string;
  contaBancaria: ContaBancaria;
  fornecedorId: string;
  fornecedor: Pessoa;
  diaFechamento: number;
  diaVencimento: number;
  limite: number | null;
  ativo: boolean;
  /** Competência (AAAA-MM) que recebe as compras de hoje. */
  faturaAtual: string;
  limiteUsado: number;
  limiteDisponivel: number | null;
}

export type TipoLancamentoCartao = 'COMPRA' | 'ESTORNO';

export interface LancamentoCartao {
  id: string;
  compraId: string;
  faturaId: string;
  data: string;
  descricao: string;
  tipo: TipoLancamentoCartao;
  valor: number;
  parcela: number | null;
  totalParcelas: number | null;
  planoContaId: string | null;
  planoConta: PlanoConta | null;
  centroCustoId: string | null;
  centroCusto: CentroCusto | null;
  fornecedorId: string | null;
  fornecedor: Pessoa | null;
  fatura?: { competencia: string };
}

export interface FaturaCartao {
  id: string | null;
  competencia: string;
  dataFechamento: string;
  dataVencimento: string;
  inicioPeriodo: string;
  datasAjustadas: boolean;
  status: 'ABERTA' | 'FECHADA';
  total: number;
  pago: number;
  contaPagar: { id: string; status: StatusConta; valor: number } | null;
  lancamentos: LancamentoCartao[];
}

export type StatusLinhaExtrato = 'PENDENTE' | 'CONCILIADA' | 'IGNORADA';

export interface ContaSugerida {
  id: string;
  descricao: string;
  dataVencimento: string;
  pessoa: string;
  saldo: number;
}

export interface LinhaExtrato {
  id: string;
  data: string;
  tipo: TipoMovimentacao;
  valor: number;
  descricao: string;
  documento: string | null;
  status: StatusLinhaExtrato;
  movimentacaoId: string | null;
  movimentacao: Movimentacao | null;
  sugestoes: Movimentacao[];
  contasSugeridas: ContaSugerida[];
}

export interface PainelConciliacao {
  contaBancaria: { id: string; nome: string };
  de: string;
  ate: string;
  linhas: LinhaExtrato[];
  semPar: Movimentacao[];
  resumo: { pendentes: number; conciliadas: number; ignoradas: number };
  saldos: { data: string; banco: number; sistema: number; diferenca: number } | null;
  ultimaImportacao: { nomeArquivo: string; criadoEm: string; de: string | null; ate: string | null } | null;
}

export interface ResultadoImportacao {
  novas: number;
  repetidas: number;
  conciliadasAutomaticamente: number;
  avisos: string[];
}

export type SituacaoContrato = 'ATIVO' | 'PAUSADO' | 'ENCERRADO';

/** Cobrança recorrente: os mesmos itens todo mês. Competências no formato AAAA-MM. */
export interface Contrato {
  id: string;
  numero: number;
  clienteId: string;
  cliente: Pessoa;
  descricao: string;
  situacao: SituacaoContrato;
  inicio: string;
  fim: string | null;
  diaFaturamento: number;
  diaVencimento: number;
  emitirNfse: boolean;
  transmitirNfse: boolean;
  planoContaId: string | null;
  centroCustoId: string | null;
  observacoes: string | null;
  valor: number;
  itens?: { id: string; produtoId: string; produto: Produto; quantidade: number; precoUnitario: number; desconto: number; total: number }[];
}

/** Situação da cobrança de um contrato num mês, calculada pela API. */
export type EstadoCobranca = 'AGENDADA' | 'A_GERAR' | 'PAUSADO' | 'PROCESSANDO' | 'FALHA' | 'NOTA_PENDENTE' | 'VENDA_CANCELADA' | 'CONCLUIDA';

export interface CobrancaDoMes {
  contrato: Pick<Contrato, 'id' | 'numero' | 'descricao' | 'situacao' | 'valor' | 'emitirNfse' | 'transmitirNfse'> & { cliente: { id: string; nome: string } };
  faturamento: string;
  vencimento: string;
  estado: EstadoCobranca;
  geracao: { id: string; situacao: string; erro: string | null; automatica: boolean; atualizadoEm: string } | null;
  venda: { id: string; numero: number; status: StatusVenda; total: number } | null;
  notas: { id: string; status: StatusNotaServico; numeroDps: number; numeroNfse: string | null; erroTransmissao: string | null }[];
}

export interface MesContratos {
  competencia: string;
  itens: CobrancaDoMes[];
  resumo: { contratos: number; gerado: number; aGerar: number; pendencias: number };
}

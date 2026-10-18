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

export interface Pessoa {
  id: string;
  nome: string;
  documento: string;
  email: string | null;
  telefone: string | null;
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

export interface Empresa {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpj: string;
  ativo: boolean;
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
  contas: { id: string; codigo: string; nome: string; tipo: TipoPlanoConta; nivel: number; valor: number }[];
  semCategoria: { receitas: number; despesas: number };
  receitas: number;
  despesas: number;
  resultado: number;
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

export interface Venda extends DocumentoComercial {
  clienteId: string;
  cliente: Pessoa;
  status: StatusVenda;
  dataFaturamento: string | null;
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

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

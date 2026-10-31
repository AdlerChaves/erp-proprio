import dayjs from 'dayjs';

/**
 * Projeção do caixa: o saldo dia a dia a partir dos dados da API, no cenário escolhido e com as simulações
 * ("e se eu fechar mais um contrato?", "e se eu retirar mais?"). Tudo em centavos por dentro, para somar sem erro.
 */

export type TipoLancamento = 'RECEBER' | 'PAGAR' | 'CONTRATO' | 'RECORRENTE' | 'SIMULADO';

export interface Lancamento {
  tipo: TipoLancamento;
  descricao: string;
  pessoa: string;
  valor: number;
  vencimento: string;
  /** Valor previsto, não o definitivo (despesa variável ou sobre o faturamento). */
  estimado?: boolean;
}

/** O que a API devolve em /financeiro/projecao. */
export interface DadosProjecao {
  hoje: string;
  ate: string;
  saldoAtual: number;
  contasBancarias: { nome: string; saldo: number }[];
  atrasados: { receber: number; pagar: number; lancamentosReceber: Lancamento[]; lancamentosPagar: Lancamento[] };
  dias: { data: string; receber: number; pagar: number; contratos: number; recorrentes: number; lancamentos: Lancamento[] }[];
}

export interface Cenario {
  /** Conta que os clientes em atraso pagam hoje. Desligado, é o cenário prudente. */
  atrasadosReceber: boolean;
  /** Mensalidades de contratos que ainda vão ser faturadas. */
  contratos: boolean;
  /** Despesas recorrentes cujas contas a pagar ainda não foram lançadas. */
  recorrentes: boolean;
}

export interface Simulacao {
  /** Entrada a mais todo mês (novo contrato, mais vendas). */
  entradaMensal: number;
  /** Saída a mais todo mês (pró-labore, contratação); negativa simula corte de custos. */
  saidaMensal: number;
  /** Dia do mês das entradas e saídas mensais simuladas. */
  diaDoMes: number;
  /** Gasto único (equipamento, investimento) e a data dele. */
  gastoUnico: number;
  dataGastoUnico: string | null;
}

export const SEM_SIMULACAO: Simulacao = { entradaMensal: 0, saidaMensal: 0, diaDoMes: 10, gastoUnico: 0, dataGastoUnico: null };
export const simulando = (s: Simulacao) => s.entradaMensal !== 0 || s.saidaMensal !== 0 || (s.gastoUnico !== 0 && !!s.dataGastoUnico);

export interface DiaProjetado {
  data: string;
  /** Centavos que entram e saem no dia (no primeiro dia, inclui as contas vencidas que o cenário considera). */
  entradas: number;
  saidas: number;
  /** Saldo ao fim do dia, em centavos. */
  saldo: number;
  lancamentos: Lancamento[];
}

const c = (reais: number) => Math.round(reais * 100);

/** Todos os dias de "de" a "ate", inclusive. */
function diasEntre(de: string, ate: string) {
  const lista: string[] = [];
  for (let d = dayjs(de); !d.isAfter(dayjs(ate), 'day'); d = d.add(1, 'day')) lista.push(d.format('YYYY-MM-DD'));
  return lista;
}

/** Lançamentos simulados: os mensais no dia escolhido (ou no último dia de meses mais curtos) e o gasto único. */
function lancamentosSimulados(de: string, ate: string, s: Simulacao): Lancamento[] {
  const lista: Lancamento[] = [];
  for (let mes = dayjs(de).startOf('month'); !mes.isAfter(dayjs(ate), 'month'); mes = mes.add(1, 'month')) {
    const data = mes.date(Math.min(s.diaDoMes, mes.daysInMonth())).format('YYYY-MM-DD');
    if (data < de || data > ate) continue;
    if (s.entradaMensal) lista.push({ tipo: 'SIMULADO', descricao: 'Entrada simulada (mensal)', pessoa: '', valor: s.entradaMensal, vencimento: data });
    if (s.saidaMensal) lista.push({ tipo: 'SIMULADO', descricao: 'Saída simulada (mensal)', pessoa: '', valor: -s.saidaMensal, vencimento: data });
  }
  if (s.gastoUnico && s.dataGastoUnico && s.dataGastoUnico >= de && s.dataGastoUnico <= ate) {
    lista.push({ tipo: 'SIMULADO', descricao: 'Gasto único simulado', pessoa: '', valor: -s.gastoUnico, vencimento: s.dataGastoUnico });
  }
  return lista;
}

/** Saldo dia a dia, de hoje ao fim do período. As contas a pagar vencidas sempre entram hoje: elas são devidas. */
export function projetar(dados: DadosProjecao, cenario: Cenario, simulacao: Simulacao = SEM_SIMULACAO): DiaProjetado[] {
  const porDia = new Map<string, Lancamento[]>();
  const incluir = (data: string, l: Lancamento) => porDia.set(data, [...(porDia.get(data) ?? []), l]);
  for (const l of dados.atrasados.lancamentosPagar) incluir(dados.hoje, l);
  if (cenario.atrasadosReceber) for (const l of dados.atrasados.lancamentosReceber) incluir(dados.hoje, l);
  for (const d of dados.dias) {
    for (const l of d.lancamentos) {
      if ((l.tipo === 'CONTRATO' && !cenario.contratos) || (l.tipo === 'RECORRENTE' && !cenario.recorrentes)) continue;
      incluir(d.data, l);
    }
  }
  for (const l of lancamentosSimulados(dados.hoje, dados.ate, simulacao)) incluir(l.vencimento, l);

  let saldo = c(dados.saldoAtual);
  return diasEntre(dados.hoje, dados.ate).map((data) => {
    const lancamentos = porDia.get(data) ?? [];
    let entradas = 0;
    let saidas = 0;
    for (const l of lancamentos) {
      // Simulado traz o sinal no valor; os demais, pelo tipo.
      const valor = l.tipo === 'PAGAR' || l.tipo === 'RECORRENTE' ? -c(l.valor) : c(l.valor);
      if (valor >= 0) entradas += valor;
      else saidas -= valor;
    }
    saldo += entradas - saidas;
    return { data, entradas, saidas, saldo, lancamentos };
  });
}

export interface Indicadores {
  /** Ao fim de hoje, já com o que vence hoje e as contas vencidas do cenário. */
  hoje: number;
  menor: { valor: number; data: string };
  /** Primeiro dia que termina com saldo negativo, ou null. */
  negativo: { data: string; valor: number; dias: number } | null;
  final: number;
  entradas: number;
  saidas: number;
}

export function indicadores(serie: DiaProjetado[]): Indicadores {
  let menor = serie[0];
  for (const d of serie) if (d.saldo < menor.saldo) menor = d;
  const negativo = serie.find((d) => d.saldo < 0);
  return {
    hoje: serie[0].saldo,
    menor: { valor: menor.saldo, data: menor.data },
    negativo: negativo ? { data: negativo.data, valor: negativo.saldo, dias: dayjs(negativo.data).diff(dayjs(serie[0].data), 'day') } : null,
    final: serie[serie.length - 1].saldo,
    entradas: serie.reduce((s, d) => s + d.entradas, 0),
    saidas: serie.reduce((s, d) => s + d.saidas, 0),
  };
}

export type Nivel = 'dia' | 'semana' | 'mes';

/** Barras legíveis: por dia até ~6 semanas, por semana até ~6 meses, por mês acima disso. */
export const nivelPara = (dias: number): Nivel => (dias <= 45 ? 'dia' : dias <= 200 ? 'semana' : 'mes');

export interface Periodo {
  inicio: string;
  fim: string;
  entradas: number;
  saidas: number;
  /** Saldo ao fim do período. */
  saldo: number;
  /** Menor saldo dentro do período. */
  menor: number;
}

/** Junta os dias em semanas (de segunda a domingo) ou meses, cortando nas pontas do período. */
export function agrupar(serie: DiaProjetado[], nivel: Nivel): Periodo[] {
  const chave = (data: string) => {
    if (nivel === 'dia') return data;
    if (nivel === 'mes') return data.slice(0, 7);
    const d = dayjs(data);
    return d.subtract((d.day() + 6) % 7, 'day').format('YYYY-MM-DD');
  };
  const grupos: Periodo[] = [];
  let atual: string | null = null;
  for (const d of serie) {
    const k = chave(d.data);
    if (k !== atual) {
      grupos.push({ inicio: d.data, fim: d.data, entradas: 0, saidas: 0, saldo: d.saldo, menor: d.saldo });
      atual = k;
    }
    const g = grupos[grupos.length - 1];
    g.fim = d.data;
    g.entradas += d.entradas;
    g.saidas += d.saidas;
    g.saldo = d.saldo;
    g.menor = Math.min(g.menor, d.saldo);
  }
  return grupos;
}

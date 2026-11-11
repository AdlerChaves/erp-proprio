import dayjs from 'dayjs';
import type { ContaFinanceira, FluxoCaixa } from '../api/tipos';

/** Janela do "vence nos próximos dias" do painel: hoje e os 6 dias seguintes. */
export const DIAS_PROXIMOS = 7;

const emAberto = (c: ContaFinanceira) => c.status === 'ABERTA' || c.status === 'PARCIAL';
const centavos = (valor: number) => Math.round(valor * 100);
const somar = (contas: ContaFinanceira[]) => contas.reduce((s, c) => s + centavos(c.saldo), 0) / 100;

/**
 * Contas em aberto (inclui parciais) divididas em vencidas, da mais antiga para a mais nova, e as que vencem
 * de hoje até `dias` - 1 dias depois, da mais próxima para a mais distante. Os totais usam o saldo em aberto.
 */
export function resumirVencimentos(contas: ContaFinanceira[], hoje: string, dias = DIAS_PROXIMOS) {
  const limite = dayjs(hoje).add(dias - 1, 'day').format('YYYY-MM-DD');
  const abertas = contas.filter(emAberto).sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento));
  const atrasadas = abertas.filter((c) => c.dataVencimento < hoje);
  const proximas = abertas.filter((c) => c.dataVencimento >= hoje && c.dataVencimento <= limite);
  return { atrasadas, totalAtrasado: somar(atrasadas), proximas, totalProximas: somar(proximas) };
}

export const diasDeAtraso = (vencimento: string, hoje: string) => dayjs(hoje).diff(dayjs(vencimento), 'day');

export function rotuloVencimento(vencimento: string, hoje: string) {
  const dias = dayjs(vencimento).diff(dayjs(hoje), 'day');
  if (dias === 0) return 'Hoje';
  if (dias === 1) return 'Amanhã';
  return dayjs(vencimento).format('DD/MM');
}

/** Fluxo mensal do painel: o que entra e o que sai em cada mês, somando o já realizado e o que ainda vence. */
export const fluxoCompacto = (periodos: FluxoCaixa['periodos']) =>
  periodos.map((p) => ({
    periodo: p.periodo,
    entra: (centavos(p.realizado.entradas) + centavos(p.previsto.entradas)) / 100,
    sai: (centavos(p.realizado.saidas) + centavos(p.previsto.saidas)) / 100,
    saldo: p.saldo,
  }));

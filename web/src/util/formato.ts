import dayjs from 'dayjs';
import type { StatusConta } from '../api/tipos';

const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const moeda = (valor: number) => MOEDA.format(valor);

/** "2026-03-05" → "05/03/2026", sem passar por Date (que poderia mudar o dia pelo fuso). */
export function data(valor: string | null | undefined) {
  if (!valor) return '';
  const [ano, mes, dia] = valor.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

/**
 * Lê uma data digitada como dd/mm/aaaa (aceita d/m/aaaa) e devolve no formato da API, ou null se for inválida.
 * Recusa datas que não existem, como 31/02.
 */
export function lerDataBR(texto: string) {
  const partes = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!partes) return null;
  const [dia, mes, ano] = partes.slice(1).map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null;
  return data.toISOString().slice(0, 10);
}

/** "2026-03" → "mar/2026". */
export function mesAno(periodo: string) {
  const [ano, mes] = periodo.split('-').map(Number);
  const nome = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][mes - 1];
  return `${nome}/${ano}`;
}

/** Data de hoje no fuso do navegador, no formato da API. */
export const hoje = () => dayjs().format('YYYY-MM-DD');

export const somarMeses = (dataIso: string, meses: number) => dayjs(dataIso).add(meses, 'month').format('YYYY-MM-DD');

/** Mantém só os dígitos. */
export const digitos = (valor: string) => valor.replace(/\D/g, '');

/** CPF 000.000.000-00 ou CNPJ 00.000.000/0000-00; outros tamanhos ficam como vieram. */
export function documento(valor: string) {
  const d = digitos(valor);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return valor;
}

export const STATUS_CONTA: Record<StatusConta, { rotulo: string; cor: string }> = {
  ABERTA: { rotulo: 'Em aberto', cor: 'blue' },
  PARCIAL: { rotulo: 'Parcial', cor: 'yellow' },
  PAGA: { rotulo: 'Paga', cor: 'green' },
  CANCELADA: { rotulo: 'Cancelada', cor: 'gray' },
};

/** Conta em aberto (total ou parcialmente) com vencimento já passado. */
export const vencida = (status: StatusConta, vencimento: string) =>
  (status === 'ABERTA' || status === 'PARCIAL') && vencimento < hoje();

/** Data e hora de um instante (ISO) no fuso do navegador: "05/03/2026 14:07". */
export const dataHora = (instante: string) => dayjs(instante).format('DD/MM/YYYY HH:mm');

/** Primeiro e último dia do mês da data, no formato da API. */
export const mesDe = (dataIso: string) => ({
  de: dayjs(dataIso).startOf('month').format('YYYY-MM-DD'),
  ate: dayjs(dataIso).endOf('month').format('YYYY-MM-DD'),
});

/**
 * Próximo código livre abaixo do pai, com a mesma quantidade de dígitos dos irmãos (2 se ainda não houver).
 * Sem pai, sugere o próximo número de primeiro nível.
 */
export function proximoCodigo(codigoPai: string | null, existentes: string[]) {
  const prefixo = codigoPai ? `${codigoPai}.` : '';
  const filhos = existentes
    .filter((c) => c.startsWith(prefixo) && !c.slice(prefixo.length).includes('.'))
    .map((c) => c.slice(prefixo.length));
  const largura = filhos.length ? Math.max(...filhos.map((f) => f.length)) : codigoPai ? 2 : 1;
  const maior = filhos.reduce((m, f) => Math.max(m, Number(f)), 0);
  return prefixo + String(maior + 1).padStart(largura, '0');
}

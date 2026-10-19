/** Datas das faturas de cartão. Competência é o mês do vencimento, no formato AAAA-MM. */

export const competenciaDe = (data: string) => data.slice(0, 7);

export function somarCompetencia(competencia: string, meses: number) {
  const [ano, mes] = competencia.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1 + meses, 1));
  return d.toISOString().slice(0, 7);
}

/** O dia no mês, ou o último dia quando o mês é mais curto (dia 31 em fevereiro → 28 ou 29). */
export function diaNoMes(competencia: string, dia: number) {
  const [ano, mes] = competencia.split('-').map(Number);
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${competencia}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`;
}

/**
 * Datas padrão da fatura que vence no mês da competência. Se o dia do fechamento é menor que o do
 * vencimento, a fatura fecha no mesmo mês (fecha 3, vence 10); senão, no mês anterior (fecha 28, vence 5).
 */
export function datasPadrao(cartao: { diaFechamento: number; diaVencimento: number }, competencia: string) {
  const mesFechamento = cartao.diaFechamento < cartao.diaVencimento ? competencia : somarCompetencia(competencia, -1);
  return { dataFechamento: diaNoMes(mesFechamento, cartao.diaFechamento), dataVencimento: diaNoMes(competencia, cartao.diaVencimento) };
}

/**
 * Fatura em que cai uma compra: a primeira cujo fechamento é depois da data da compra.
 * Compra no próprio dia do fechamento vai para a fatura seguinte ("melhor dia de compra").
 */
export function competenciaDaCompra(data: string, fechamentoDe: (competencia: string) => string) {
  let competencia = somarCompetencia(competenciaDe(data), -1);
  for (let i = 0; i < 4; i++, competencia = somarCompetencia(competencia, 1)) {
    if (data < fechamentoDe(competencia)) return competencia;
  }
  throw new Error(`Não foi possível achar a fatura da compra de ${data}`);
}

/**
 * Calendário bancário nacional: fins de semana e feriados em que os bancos não abrem em todo o país.
 * Feriados estaduais e municipais (ex.: aniversário da cidade) não entram; para eles, a data pode ser
 * ajustada na própria conta.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (ano: number, mes: number, dia: number) => new Date(Date.UTC(ano, mes - 1, dia));
const somar = (d: Date, dias: number) => new Date(d.getTime() + dias * 86_400_000);

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function pascoa(ano: number) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(ano, mes, dia);
}

const cache = new Map<number, Set<string>>();

/**
 * Feriados bancários nacionais do ano: os fixos (inclusive 20/11, nacional desde 2024) e os móveis
 * (segunda e terça de Carnaval, Sexta-feira Santa e Corpus Christi), em que não há expediente bancário.
 */
export function feriadosBancarios(ano: number) {
  let lista = cache.get(ano);
  if (!lista) {
    const p = pascoa(ano);
    const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25', ...(ano >= 2024 ? ['11-20'] : [])];
    lista = new Set([
      ...fixos.map((md) => `${ano}-${md}`),
      iso(somar(p, -48)),
      iso(somar(p, -47)),
      iso(somar(p, -2)),
      iso(somar(p, 60)),
    ]);
    cache.set(ano, lista);
  }
  return lista;
}

export function diaUtil(data: string) {
  const d = new Date(`${data}T00:00:00Z`);
  const semana = d.getUTCDay();
  return semana !== 0 && semana !== 6 && !feriadosBancarios(d.getUTCFullYear()).has(data);
}

export type AjusteDiaUtil = 'ANTECIPAR' | 'POSTERGAR' | 'MANTER';

/** Leva a data para o dia útil anterior ou seguinte, se ela não for dia útil; MANTER deixa como está. */
export function ajustarDiaUtil(data: string, ajuste: AjusteDiaUtil) {
  if (ajuste === 'MANTER') return data;
  let d = new Date(`${data}T00:00:00Z`);
  while (!diaUtil(iso(d))) d = somar(d, ajuste === 'ANTECIPAR' ? -1 : 1);
  return iso(d);
}

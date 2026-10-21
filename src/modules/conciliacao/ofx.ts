import { createHash } from 'node:crypto';

/** Uma transação do extrato, já normalizada. */
export interface TransacaoOfx {
  /** Identificador estável para não importar a mesma transação duas vezes. */
  chave: string;
  fitid: string | null;
  data: string;
  tipo: 'ENTRADA' | 'SAIDA';
  /** Sempre positivo. */
  valor: number;
  descricao: string;
  documento: string | null;
  tipoOfx: string | null;
}

export interface ExtratoOfx {
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  de: string | null;
  ate: string | null;
  /** Saldo informado pelo banco (LEDGERBAL), se houver. */
  saldo: { valor: number; data: string } | null;
  transacoes: TransacaoOfx[];
}

/** TRNTYPE que significam saída quando o banco manda o valor sem sinal. */
const TIPOS_SAIDA = new Set(['DEBIT', 'PAYMENT', 'CHECK', 'FEE', 'SRVCHG', 'ATM', 'POS', 'DIRECTDEBIT', 'REPEATPMT']);

/**
 * Decodifica o arquivo conforme o cabeçalho: OFX 1.x costuma vir em Windows-1252 ("CHARSET:1252"),
 * OFX 2.x em UTF-8 (declaração XML). Sem indicação, tenta UTF-8 e recua para Windows-1252 se houver erro.
 */
export function decodificarOfx(bytes: Buffer) {
  const cabecalho = bytes.subarray(0, 600).toString('latin1').toUpperCase();
  if (/CHARSET:\s*(1252|ISO-8859-1|8859-1)/.test(cabecalho) || /ENCODING="(WINDOWS-1252|ISO-8859-1)"/.test(cabecalho)) {
    return new TextDecoder('windows-1252').decode(bytes);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Valor de uma tag "folha", tanto no OFX 1.x (sem fechamento) quanto no 2.x (XML). */
function campo(bloco: string, tag: string) {
  const m = bloco.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'));
  const valor = m?.[1].trim();
  return valor ? desfazerEntidades(valor) : null;
}

const desfazerEntidades = (v: string) =>
  v.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** "20261031120000[-3:BRT]" → "2026-10-31". */
function data(valor: string | null) {
  const m = valor?.match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Aceita "-12.50", "-12,50" e "1.234,56" (alguns bancos brasileiros fogem do padrão). */
function numero(valor: string | null) {
  if (!valor) return null;
  let v = valor.replace(/\s/g, '');
  if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const blocos = (texto: string, tag: string) => [...texto.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'gi'))].map((m) => m[1]);

export class OfxInvalido extends Error {}

export function lerOfx(texto: string): ExtratoOfx {
  if (!/<OFX>/i.test(texto)) throw new OfxInvalido('O arquivo não é um OFX (falta a tag <OFX>)');
  if (/<CCSTMTRS>/i.test(texto)) {
    throw new OfxInvalido('Este é um extrato de cartão de crédito; importe aqui o extrato da conta bancária');
  }
  const conta = blocos(texto, 'BANKACCTFROM')[0] ?? '';
  const lista = blocos(texto, 'BANKTRANLIST')[0] ?? texto;
  const saldoBloco = blocos(texto, 'LEDGERBAL')[0];
  const saldoValor = saldoBloco ? numero(campo(saldoBloco, 'BALAMT')) : null;
  const saldoData = saldoBloco ? data(campo(saldoBloco, 'DTASOF')) : null;

  const ocorrencias = new Map<string, number>();
  const transacoes: TransacaoOfx[] = [];
  for (const bloco of blocos(texto, 'STMTTRN')) {
    const dataTransacao = data(campo(bloco, 'DTPOSTED'));
    const bruto = numero(campo(bloco, 'TRNAMT'));
    if (!dataTransacao || bruto === null || bruto === 0) continue;
    const tipoOfx = campo(bloco, 'TRNTYPE')?.toUpperCase() ?? null;
    const saida = bruto < 0 || (tipoOfx !== null && TIPOS_SAIDA.has(tipoOfx));
    const valor = Math.round(Math.abs(bruto) * 100) / 100;
    const descricao = [campo(bloco, 'NAME'), campo(bloco, 'MEMO')].filter(Boolean).join(' - ').replace(/\s+/g, ' ').slice(0, 255) || 'Sem descrição';
    const fitid = campo(bloco, 'FITID');
    // Alguns bancos repetem o FITID (ou não mandam): a chave junta FITID, data, valor e descrição,
    // e numera transações idênticas no mesmo arquivo para não descartar uma legítima.
    const base = `${fitid ?? ''}|${dataTransacao}|${saida ? '-' : '+'}${valor.toFixed(2)}|${fitid ? '' : descricao}`;
    const n = (ocorrencias.get(base) ?? 0) + 1;
    ocorrencias.set(base, n);
    transacoes.push({
      chave: createHash('sha1').update(`${base}|${n}`).digest('hex'),
      fitid,
      data: dataTransacao,
      tipo: saida ? 'SAIDA' : 'ENTRADA',
      valor,
      descricao,
      documento: campo(bloco, 'CHECKNUM') ?? campo(bloco, 'REFNUM'),
      tipoOfx,
    });
  }
  return {
    banco: campo(conta, 'BANKID'),
    agencia: campo(conta, 'BRANCHID'),
    conta: campo(conta, 'ACCTID'),
    de: data(campo(lista, 'DTSTART')),
    ate: data(campo(lista, 'DTEND')),
    saldo: saldoValor !== null && saldoData ? { valor: saldoValor, data: saldoData } : null,
    transacoes,
  };
}

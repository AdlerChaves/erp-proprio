/** Busca e ordenação das tabelas de dados, sem depender de React (testadas à parte). */

export type Direcao = 'asc' | 'desc';
export type ValorOrdenacao = string | number | null | undefined;

/** "  Honorários  CONTÁBEIS " → "honorarios contabeis". */
export const normalizarBusca = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Linhas que contêm todas as palavras da busca, em qualquer ordem. Busca vazia devolve a própria lista. */
export function filtrarPorBusca<T>(linhas: T[], busca: string, texto: (linha: T) => string): T[] {
  const termos = normalizarBusca(busca).split(' ').filter(Boolean);
  if (termos.length === 0) return linhas;
  return linhas.filter((l) => {
    const alvo = normalizarBusca(texto(l));
    return termos.every((t) => alvo.includes(t));
  });
}

const COLACAO = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
const vazio = (v: ValorOrdenacao) => v === null || v === undefined || v === '';

/** Cópia ordenada e estável; valores vazios ficam sempre no fim, nos dois sentidos. */
export function ordenarLinhas<T>(linhas: T[], valor: (linha: T) => ValorOrdenacao, direcao: Direcao): T[] {
  const sinal = direcao === 'asc' ? 1 : -1;
  return linhas
    .map((linha, i) => ({ linha, i, v: valor(linha) }))
    .sort((a, b) => {
      if (vazio(a.v) || vazio(b.v)) return vazio(a.v) === vazio(b.v) ? a.i - b.i : vazio(a.v) ? 1 : -1;
      const comparacao = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : COLACAO.compare(String(a.v), String(b.v));
      return comparacao === 0 ? a.i - b.i : comparacao * sinal;
    })
    .map((x) => x.linha);
}

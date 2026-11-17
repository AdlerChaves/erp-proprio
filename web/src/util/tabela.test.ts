import { describe, expect, it } from 'vitest';
import { filtrarPorBusca, normalizarBusca, ordenarLinhas } from './tabela';

interface Linha {
  id: string;
  nome: string;
  valor: number | null;
  data: string;
}
const linhas: Linha[] = [
  { id: '1', nome: 'Honorários contábeis', valor: 650, data: '2026-11-20' },
  { id: '2', nome: 'aluguel novembro', valor: 3200, data: '2026-11-10' },
  { id: '3', nome: 'Internet e telefonia', valor: null, data: '2026-11-15' },
  { id: '4', nome: 'Compra nº 10', valor: 650, data: '2026-10-04' },
  { id: '5', nome: 'Compra nº 2', valor: 3800, data: '2026-10-04' },
];

describe('tabela de dados', () => {
  it('normaliza a busca: sem acento, sem diferença de maiúsculas e espaços extras', () => {
    expect(normalizarBusca('  Honorários  CONTÁBEIS ')).toBe('honorarios contabeis');
  });

  it('busca por todas as palavras, em qualquer ordem e sem acento', () => {
    const texto = (l: Linha) => `${l.nome} ${l.valor ?? ''}`;
    expect(filtrarPorBusca(linhas, 'contabeis honor', texto).map((l) => l.id)).toEqual(['1']);
    expect(filtrarPorBusca(linhas, 'compra', texto).map((l) => l.id)).toEqual(['4', '5']);
    expect(filtrarPorBusca(linhas, '3200', texto).map((l) => l.id)).toEqual(['2']);
    expect(filtrarPorBusca(linhas, '   ', texto)).toBe(linhas);
  });

  it('ordena texto em português sem diferenciar maiúsculas, com números dentro do texto em ordem natural', () => {
    expect(ordenarLinhas(linhas, (l) => l.nome, 'asc').map((l) => l.id)).toEqual(['2', '5', '4', '1', '3']);
  });

  it('ordena números nos dois sentidos, com vazios sempre no fim', () => {
    expect(ordenarLinhas(linhas, (l) => l.valor, 'asc').map((l) => l.id)).toEqual(['1', '4', '2', '5', '3']);
    expect(ordenarLinhas(linhas, (l) => l.valor, 'desc').map((l) => l.id)).toEqual(['5', '2', '1', '4', '3']);
  });

  it('é estável: empates mantêm a ordem original', () => {
    expect(ordenarLinhas(linhas, (l) => l.data, 'asc').map((l) => l.id)).toEqual(['4', '5', '2', '3', '1']);
  });

  it('não altera a lista recebida', () => {
    const copia = [...linhas];
    ordenarLinhas(linhas, (l) => l.valor, 'desc');
    expect(linhas).toEqual(copia);
  });
});

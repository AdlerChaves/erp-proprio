import { describe, expect, it } from 'vitest';
import type { ContaFinanceira, FluxoCaixa } from '../api/tipos';
import { diasDeAtraso, fluxoCompacto, resumirVencimentos, rotuloVencimento } from './vencimentos';

const conta = (id: string, dataVencimento: string, saldo: number, status: ContaFinanceira['status'] = 'ABERTA') =>
  ({ id, dataVencimento, saldo, status, valor: saldo }) as ContaFinanceira;

describe('vencimentos do painel', () => {
  const HOJE = '2026-11-10';

  it('separa as contas em aberto em atrasadas (mais antiga primeiro) e próximas 7 dias (mais próxima primeiro)', () => {
    const r = resumirVencimentos(
      [
        conta('a', '2026-11-05', 4650),
        conta('b', '2026-10-04', 12400),
        conta('c', '2026-11-10', 3200),
        conta('d', '2026-11-16', 100, 'PARCIAL'),
        conta('e', '2026-11-17', 999), // fora da janela de 7 dias (10 a 16)
        conta('f', '2026-10-01', 500, 'PAGA'),
        conta('g', '2026-11-12', 50, 'CANCELADA'),
        conta('h', '2026-11-15', 389.9),
      ],
      HOJE,
    );
    expect(r.atrasadas.map((c) => c.id)).toEqual(['b', 'a']);
    expect(r.totalAtrasado).toBe(17050);
    expect(r.proximas.map((c) => c.id)).toEqual(['c', 'h', 'd']);
    expect(r.totalProximas).toBeCloseTo(3689.9);
  });

  it('soma em centavos para não acumular erro de ponto flutuante', () => {
    const r = resumirVencimentos([conta('a', '2026-11-01', 0.1), conta('b', '2026-11-02', 0.2)], HOJE);
    expect(r.totalAtrasado).toBe(0.3);
  });

  it('lista vazia não quebra', () => {
    expect(resumirVencimentos([], HOJE)).toEqual({ atrasadas: [], totalAtrasado: 0, proximas: [], totalProximas: 0 });
  });

  it('conta os dias de atraso', () => {
    expect(diasDeAtraso('2026-10-04', HOJE)).toBe(37);
    expect(diasDeAtraso('2026-11-09', HOJE)).toBe(1);
  });

  it('rotula o vencimento como Hoje, Amanhã ou dia/mês', () => {
    expect(rotuloVencimento('2026-11-10', HOJE)).toBe('Hoje');
    expect(rotuloVencimento('2026-11-11', HOJE)).toBe('Amanhã');
    expect(rotuloVencimento('2026-11-15', HOJE)).toBe('15/11');
  });

  it('compacta o fluxo: entra e sai somam o realizado e o previsto de cada mês', () => {
    const periodos: FluxoCaixa['periodos'] = [
      { periodo: '2026-11', aberturas: 0, realizado: { entradas: 100, saidas: 50 }, previsto: { entradas: 4730, saidas: 12889.9 }, saldo: 10177.32 },
      { periodo: '2026-12', aberturas: 0, realizado: { entradas: 0, saidas: 0 }, previsto: { entradas: 0, saidas: 8239.9 }, saldo: -492.38 },
    ];
    expect(fluxoCompacto(periodos)).toEqual([
      { periodo: '2026-11', entra: 4830, sai: 12939.9, saldo: 10177.32 },
      { periodo: '2026-12', entra: 0, sai: 8239.9, saldo: -492.38 },
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { agrupar, type DadosProjecao, indicadores, nivelPara, projetar, SEM_SIMULACAO } from './projecao';

const l = (tipo: 'RECEBER' | 'PAGAR' | 'CONTRATO', valor: number, vencimento: string, descricao: string = tipo) => ({ tipo, valor, vencimento, descricao, pessoa: 'X' });

const DADOS: DadosProjecao = {
  hoje: '2026-11-01',
  ate: '2026-11-30',
  saldoAtual: 1000,
  contasBancarias: [{ nome: 'Banco', saldo: 1000 }],
  atrasados: {
    receber: 300,
    pagar: 200,
    lancamentosReceber: [l('RECEBER', 300, '2026-10-20')],
    lancamentosPagar: [l('PAGAR', 200, '2026-10-25')],
  },
  dias: [
    { data: '2026-11-05', receber: 0, pagar: 1500, contratos: 0, recorrentes: 0, lancamentos: [l('PAGAR', 1500, '2026-11-05', 'Aluguel')] },
    { data: '2026-11-10', receber: 400, pagar: 0, contratos: 600, recorrentes: 0, lancamentos: [l('RECEBER', 400, '2026-11-10'), l('CONTRATO', 600, '2026-11-10')] },
  ],
};

describe('projeção do caixa', () => {
  it('soma dia a dia; as contas a pagar vencidas sempre entram hoje', () => {
    const serie = projetar(DADOS, { atrasadosReceber: false, contratos: true, recorrentes: true });
    expect(serie).toHaveLength(30);
    expect(serie[0]).toMatchObject({ data: '2026-11-01', saidas: 20000, saldo: 80000 });
    expect(serie.find((d) => d.data === '2026-11-05')!.saldo).toBe(-70000);
    expect(serie.find((d) => d.data === '2026-11-10')!).toMatchObject({ entradas: 100000, saldo: 30000 });
    expect(serie.at(-1)!.saldo).toBe(30000);

    const ind = indicadores(serie);
    expect(ind).toMatchObject({ hoje: 80000, menor: { valor: -70000, data: '2026-11-05' }, final: 30000 });
    expect(ind.negativo).toEqual({ data: '2026-11-05', valor: -70000, dias: 4 });
  });

  it('o cenário decide se conta com os atrasados a receber e com os contratos a faturar', () => {
    const otimista = projetar(DADOS, { atrasadosReceber: true, contratos: true, recorrentes: true });
    expect(otimista[0].saldo).toBe(110000);
    const semContratos = projetar(DADOS, { atrasadosReceber: false, contratos: false, recorrentes: true });
    expect(semContratos.at(-1)!.saldo).toBe(-30000);
  });

  it('despesas recorrentes a lançar são saídas, e o cenário pode tirá-las', () => {
    const comDespesa: DadosProjecao = {
      ...DADOS,
      dias: [...DADOS.dias, { data: '2026-11-20', receber: 0, pagar: 0, contratos: 0, recorrentes: 250, lancamentos: [{ tipo: 'RECORRENTE', valor: 250, vencimento: '2026-11-20', descricao: 'Energia', pessoa: 'X', estimado: true }] }],
    };
    expect(projetar(comDespesa, { atrasadosReceber: false, contratos: true, recorrentes: true }).at(-1)!.saldo).toBe(30000 - 25000);
    expect(projetar(comDespesa, { atrasadosReceber: false, contratos: true, recorrentes: false }).at(-1)!.saldo).toBe(30000);
  });

  it('simula entradas e saídas mensais e um gasto único', () => {
    const serie = projetar(DADOS, { atrasadosReceber: false, contratos: true, recorrentes: true }, { ...SEM_SIMULACAO, entradaMensal: 1000, saidaMensal: 200, diaDoMes: 3, gastoUnico: 500, dataGastoUnico: '2026-11-20' });
    const dia3 = serie.find((d) => d.data === '2026-11-03')!;
    expect(dia3).toMatchObject({ entradas: 100000, saidas: 20000, saldo: 160000 });
    expect(indicadores(serie).negativo).toBeNull();
    expect(serie.at(-1)!.saldo).toBe(30000 + 80000 - 50000);
    // Dia 31 vira o último dia de meses mais curtos.
    const fimDoMes = projetar(DADOS, { atrasadosReceber: false, contratos: true, recorrentes: true }, { ...SEM_SIMULACAO, entradaMensal: 10, diaDoMes: 31 });
    expect(fimDoMes.find((d) => d.data === '2026-11-30')!.entradas).toBe(1000);
  });

  it('agrupa por semana (segunda a domingo) e por mês, guardando o saldo do fim e o menor do período', () => {
    const serie = projetar(DADOS, { atrasadosReceber: false, contratos: true, recorrentes: true });
    const semanas = agrupar(serie, 'semana');
    // 01/11/2026 é domingo: a primeira "semana" tem um dia só.
    expect(semanas[0]).toMatchObject({ inicio: '2026-11-01', fim: '2026-11-01' });
    expect(semanas[1]).toMatchObject({ inicio: '2026-11-02', fim: '2026-11-08', saidas: 150000, saldo: -70000, menor: -70000 });
    expect(agrupar(serie, 'mes')).toEqual([expect.objectContaining({ inicio: '2026-11-01', fim: '2026-11-30', entradas: 100000, saidas: 170000, saldo: 30000 })]);
    expect([nivelPara(30), nivelPara(90), nivelPara(365)]).toEqual(['dia', 'semana', 'mes']);
  });
});

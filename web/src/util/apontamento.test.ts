import { describe, expect, it } from 'vitest';
import type { Obra } from '../api/tipos';
import { classificar, etapaAtual, ordenarObras, rotuloPrazo } from './apontamento';

const HOJE = '2026-11-17';
const etapa = (ordem: number, dataLimite: string | null = null, concluidaEm: string | null = null) => ({
  id: `e${ordem}`,
  nome: `Etapa ${ordem}`,
  ordem,
  dataLimite,
  concluidaEm,
});
const obra = (nome: string, etapas: Obra['etapas'], situacao: Obra['situacao'] = 'EM_EXECUCAO'): Obra => ({ id: nome, nome, situacao, observacao: null, etapas });

describe('painel de apontamento', () => {
  it('a etapa atual é a primeira não concluída, na ordem', () => {
    const o = obra('A', [etapa(1, null, '2026-11-01'), etapa(2, '2026-11-20'), etapa(3)]);
    expect(etapaAtual(o)).toMatchObject({ indice: 1, total: 3, etapa: { ordem: 2 } });
    expect(etapaAtual(obra('B', [etapa(1, null, '2026-11-01')]))).toMatchObject({ etapa: null, indice: 1, total: 1 });
    expect(etapaAtual(obra('C', []))).toEqual({ etapa: null, indice: 0, total: 0 });
  });

  it('classifica pela data limite da etapa atual e pelos dias de alerta da empresa', () => {
    const com = (data: string | null) => obra('X', [etapa(1, data)]);
    expect(classificar(com('2026-11-16'), HOJE, 3)).toBe('atraso');
    expect(classificar(com('2026-11-17'), HOJE, 3)).toBe('atencao');
    expect(classificar(com('2026-11-20'), HOJE, 3)).toBe('atencao');
    expect(classificar(com('2026-11-21'), HOJE, 3)).toBe('ok');
    expect(classificar(com('2026-11-21'), HOJE, 5)).toBe('atencao');
    expect(classificar(com('2026-11-17'), HOJE, 0)).toBe('atencao');
    expect(classificar(com('2026-11-18'), HOJE, 0)).toBe('ok');
  });

  it('fica cinza quando concluída, sem etapas pendentes ou sem data limite', () => {
    expect(classificar(obra('A', [etapa(1, '2026-11-01')], 'CONCLUIDO'), HOJE, 3)).toBe('neutro');
    expect(classificar(obra('B', [etapa(1, '2026-11-01', '2026-11-02')]), HOJE, 3)).toBe('neutro');
    expect(classificar(obra('C', []), HOJE, 3)).toBe('neutro');
    expect(classificar(obra('D', [etapa(1, null)]), HOJE, 3)).toBe('neutro');
  });

  it('descreve o prazo em palavras', () => {
    const com = (data: string | null) => obra('X', [etapa(1, data)]);
    expect(rotuloPrazo(com('2026-11-15'), HOJE)).toBe('Atrasada há 2 dias');
    expect(rotuloPrazo(com('2026-11-16'), HOJE)).toBe('Atrasada há 1 dia');
    expect(rotuloPrazo(com('2026-11-17'), HOJE)).toBe('Vence hoje');
    expect(rotuloPrazo(com('2026-11-18'), HOJE)).toBe('Vence amanhã');
    expect(rotuloPrazo(com('2026-11-25'), HOJE)).toBe('Vence em 8 dias');
    expect(rotuloPrazo(com(null), HOJE)).toBe('Sem data limite');
    expect(rotuloPrazo(obra('Y', []), HOJE)).toBe('Sem etapas');
    expect(rotuloPrazo(obra('Z', [etapa(1, null, '2026-11-01')]), HOJE)).toBe('Etapas concluídas');
    expect(rotuloPrazo(obra('W', [etapa(1, '2026-11-01')], 'CONCLUIDO'), HOJE)).toBe('Obra concluída');
  });

  it('ordena: atrasadas, vencem em breve, no prazo e por último as cinzas; dentro do grupo, a data mais próxima primeiro', () => {
    const lista = [
      obra('Sem prazo', [etapa(1)]),
      obra('No prazo longe', [etapa(1, '2026-12-20')]),
      obra('Atrasada pouco', [etapa(1, '2026-11-16')]),
      obra('Atenção', [etapa(1, '2026-11-18')]),
      obra('No prazo perto', [etapa(1, '2026-11-25')]),
      obra('Atrasada muito', [etapa(1, '2026-11-01')]),
      obra('Concluída', [etapa(1, '2026-11-01')], 'CONCLUIDO'),
    ];
    expect(ordenarObras(lista, HOJE, 3).map((o) => o.nome)).toEqual([
      'Atrasada muito',
      'Atrasada pouco',
      'Atenção',
      'No prazo perto',
      'No prazo longe',
      'Sem prazo',
      'Concluída',
    ]);
  });
});

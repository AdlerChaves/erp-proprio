import dayjs from 'dayjs';
import type { EtapaObra, Obra, SituacaoObra } from '../api/tipos';

/** Cor do cronograma no painel: atraso (vermelho), atenção (amarelo), ok (verde) e neutro (cinza). */
export type Cronograma = 'atraso' | 'atencao' | 'ok' | 'neutro';

export const SITUACOES_OBRA: Record<SituacaoObra, { rotulo: string; aguardando: boolean }> = {
  EM_EXECUCAO: { rotulo: 'Em execução', aguardando: false },
  AGUARDANDO_MATERIAL: { rotulo: 'Aguardando material', aguardando: true },
  AGUARDANDO_APROVACAO: { rotulo: 'Aguardando aprovação', aguardando: true },
  AGUARDANDO_CLIENTE: { rotulo: 'Aguardando cliente', aguardando: true },
  AGUARDANDO_EQUIPE: { rotulo: 'Aguardando equipe', aguardando: true },
  PAUSADO: { rotulo: 'Pausado', aguardando: false },
  CONCLUIDO: { rotulo: 'Concluído', aguardando: false },
};

/** Etapa em andamento (primeira não concluída), sua posição (0 = primeira) e o total de etapas da obra. */
export function etapaAtual(obra: Obra): { etapa: EtapaObra | null; indice: number; total: number } {
  const indice = obra.etapas.findIndex((e) => !e.concluidaEm);
  return indice < 0 ? { etapa: null, indice: obra.etapas.length, total: obra.etapas.length } : { etapa: obra.etapas[indice], indice, total: obra.etapas.length };
}

const diasAte = (data: string, hoje: string) => dayjs(data).diff(dayjs(hoje), 'day');

/** Classificação pela data limite da etapa atual; `diasAlerta` vem da configuração da empresa. */
export function classificar(obra: Obra, hoje: string, diasAlerta: number): Cronograma {
  const { etapa } = etapaAtual(obra);
  if (obra.situacao === 'CONCLUIDO' || !etapa?.dataLimite) return 'neutro';
  const dias = diasAte(etapa.dataLimite, hoje);
  if (dias < 0) return 'atraso';
  return dias <= diasAlerta ? 'atencao' : 'ok';
}

export function rotuloPrazo(obra: Obra, hoje: string) {
  if (obra.situacao === 'CONCLUIDO') return 'Obra concluída';
  if (obra.etapas.length === 0) return 'Sem etapas';
  const { etapa } = etapaAtual(obra);
  if (!etapa) return 'Etapas concluídas';
  if (!etapa.dataLimite) return 'Sem data limite';
  const dias = diasAte(etapa.dataLimite, hoje);
  if (dias < 0) return `Atrasada há ${-dias} ${dias === -1 ? 'dia' : 'dias'}`;
  if (dias === 0) return 'Vence hoje';
  if (dias === 1) return 'Vence amanhã';
  return `Vence em ${dias} dias`;
}

const GRUPO: Record<Cronograma, number> = { atraso: 0, atencao: 1, ok: 2, neutro: 3 };

/** Ordem dos cards: o que precisa de atenção primeiro, e dentro de cada grupo a data mais próxima. */
export function ordenarObras(obras: Obra[], hoje: string, diasAlerta: number) {
  return obras
    .map((obra) => ({ obra, grupo: GRUPO[classificar(obra, hoje, diasAlerta)], data: etapaAtual(obra).etapa?.dataLimite ?? '9999-12-31' }))
    .sort(
      (a, b) =>
        a.grupo - b.grupo ||
        Number(a.obra.situacao === 'CONCLUIDO') - Number(b.obra.situacao === 'CONCLUIDO') ||
        a.data.localeCompare(b.data) ||
        a.obra.nome.localeCompare(b.obra.nome, 'pt-BR'),
    )
    .map((x) => x.obra);
}

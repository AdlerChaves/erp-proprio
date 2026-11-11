import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useMemo } from 'react';
import { hoje } from '../util/formato';
import { DIAS_PROXIMOS, resumirVencimentos } from '../util/vencimentos';
import { api, consulta } from './cliente';
import type { ContaFinanceira } from './tipos';

export type RotaContas = '/contas-pagar' | '/contas-receber';

/**
 * Contas que vencem até o fim da janela de próximos dias, já resumidas em atrasadas e próximas. Usada pelo menu
 * (contadores de atraso) e pelo painel. A chave começa pela rota das contas, então registrar ou estornar uma baixa
 * na tela de contas (que invalida essa rota) também atualiza o menu e o painel.
 */
export function useVencimentos(rota: RotaContas) {
  const dia = hoje();
  const filtro = consulta({ vencimentoAte: dayjs(dia).add(DIAS_PROXIMOS - 1, 'day').format('YYYY-MM-DD') });
  const query = useQuery({
    queryKey: [rota, filtro],
    queryFn: () => api.get<ContaFinanceira[]>(`${rota}${filtro}`),
    staleTime: 60_000,
  });
  const resumo = useMemo(() => (query.data ? resumirVencimentos(query.data, dia) : null), [query.data, dia]);
  return { ...query, resumo };
}

import { Card, Loader, Select, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, consulta } from '../api/cliente';
import type { CentroCusto, Dre as DadosDre, RegimeDre } from '../api/tipos';
import { Cabecalho, ErroCarregamento, SemPermissao } from '../componentes/comum';
import { AvisoSemCategoria, FiltroResultado, TabelaResultado } from '../componentes/Resultado';
import { useSessao } from '../sessao/sessao';
import { hoje, mesDe } from '../util/formato';

export function Dre() {
  const { pode } = useSessao();
  const inicial = mesDe(hoje());
  const [de, setDe] = useState<string | null>(inicial.de);
  const [ate, setAte] = useState<string | null>(inicial.ate);
  const [regime, setRegime] = useState<RegimeDre>('competencia');
  const [centroCustoId, setCentroCustoId] = useState<string | null>(null);
  const periodoValido = !!de && !!ate && de <= ate;

  const centros = useQuery({ queryKey: ['/centros-custo'], queryFn: () => api.get<CentroCusto[]>('/centros-custo'), enabled: pode('verSaldos') });
  const dre = useQuery({
    queryKey: ['dre', de, ate, regime, centroCustoId],
    queryFn: () => api.get<DadosDre>(`/financeiro/dre${consulta({ de, ate, regime, centroCustoId })}`),
    enabled: periodoValido && pode('verSaldos'),
  });

  if (!pode('verSaldos')) return <SemPermissao titulo="DRE" />;

  return (
    <>
      <Cabecalho titulo="DRE" descricao="Demonstração do resultado: receitas menos despesas no período, por categoria" />
      <Stack>
        <Card withBorder>
          <FiltroResultado
            de={de}
            ate={ate}
            regime={regime}
            aoMudarPeriodo={(novoDe, novoAte) => {
              setDe(novoDe);
              setAte(novoAte);
            }}
            aoMudarRegime={setRegime}
            extra={
              <Select
                label="Centro de custo"
                placeholder="Todos"
                clearable
                searchable
                value={centroCustoId}
                onChange={setCentroCustoId}
                data={(centros.data ?? []).map((c) => ({ value: c.id, label: c.ativo ? c.nome : `${c.nome} (inativo)` }))}
              />
            }
          />
        </Card>

        {!periodoValido ? (
          <Text c="red" size="sm">
            Informe o período, com a data final igual ou posterior à inicial.
          </Text>
        ) : dre.isPending ? (
          <Loader />
        ) : dre.isError ? (
          <ErroCarregamento erro={dre.error} />
        ) : (
          <Card withBorder padding={0}>
            <TabelaResultado resultado={dre.data} />
          </Card>
        )}
        {dre.data && <AvisoSemCategoria resultado={dre.data} />}
      </Stack>
    </>
  );
}

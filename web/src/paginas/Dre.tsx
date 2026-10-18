import { Button, Card, Group, Loader, SegmentedControl, SimpleGrid, Stack, Table, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Fragment, useState } from 'react';
import { api, consulta } from '../api/cliente';
import type { Dre as DadosDre, RegimeDre, TipoPlanoConta } from '../api/tipos';
import { Cabecalho, CampoData, ErroCarregamento, SemPermissao } from '../componentes/comum';
import { useSessao } from '../sessao/sessao';
import { data, hoje, mesDe, moeda } from '../util/formato';

const ATALHOS = [
  { rotulo: 'Este mês', periodo: () => mesDe(hoje()) },
  { rotulo: 'Mês passado', periodo: () => mesDe(dayjs().subtract(1, 'month').format('YYYY-MM-DD')) },
  { rotulo: 'Este ano', periodo: () => ({ de: dayjs().startOf('year').format('YYYY-MM-DD'), ate: dayjs().endOf('year').format('YYYY-MM-DD') }) },
];

const REGIMES: { value: RegimeDre; label: string; explicacao: string }[] = [
  {
    value: 'competencia',
    label: 'Competência',
    explicacao: 'Contas pela data de emissão e pelo valor original, pagas ou não.',
  },
  {
    value: 'caixa',
    label: 'Caixa',
    explicacao: 'Pagamentos pela data em que aconteceram, pelo valor efetivamente pago (com juros, multa e desconto).',
  },
];

export function Dre() {
  const { pode } = useSessao();
  const inicial = mesDe(hoje());
  const [de, setDe] = useState<string | null>(inicial.de);
  const [ate, setAte] = useState<string | null>(inicial.ate);
  const [regime, setRegime] = useState<RegimeDre>('competencia');
  const periodoValido = !!de && !!ate && de <= ate;

  const dre = useQuery({
    queryKey: ['dre', de, ate, regime],
    queryFn: () => api.get<DadosDre>(`/financeiro/dre${consulta({ de, ate, regime })}`),
    enabled: periodoValido && pode('verSaldos'),
  });

  if (!pode('verSaldos')) return <SemPermissao titulo="DRE" />;
  const percentual = (valor: number) => (dre.data && dre.data.receitas > 0 ? `${((valor / dre.data.receitas) * 100).toFixed(1).replace('.', ',')}%` : '');

  const secao = (tipo: TipoPlanoConta, titulo: string, total: number, semCategoria: number) => {
    const doTipo = dre.data!.contas.filter((c) => c.tipo === tipo);
    // A raiz única do tipo ("1 Receitas") repetiria o total da seção; mostra só o que está abaixo dela.
    const raizUnica = doTipo.filter((c) => c.nivel === 1).length === 1;
    const contas = raizUnica ? doTipo.filter((c) => c.nivel > 1) : doTipo;
    const recuo = (nivel: number) => (raizUnica ? nivel - 1 : nivel) * 20;
    return (
      <Fragment key={tipo}>
        <Table.Tr bg="var(--mantine-color-gray-0)">
          <Table.Td fw={700}>{titulo}</Table.Td>
          <Table.Td ta="right" fw={700}>
            {moeda(total)}
          </Table.Td>
          <Table.Td ta="right" c="dimmed" fw={700} visibleFrom="xs">
            {percentual(total)}
          </Table.Td>
        </Table.Tr>
        {contas.map((c) => (
          <Table.Tr key={c.id}>
            <Table.Td pl={recuo(c.nivel)}>
              <Text size="sm" fw={recuo(c.nivel) === 20 ? 600 : undefined}>
                <Text span ff="monospace" c="dimmed" size="xs" mr={6}>
                  {c.codigo}
                </Text>
                {c.nome}
              </Text>
            </Table.Td>
            <Table.Td ta="right">{moeda(c.valor)}</Table.Td>
            <Table.Td ta="right" c="dimmed" visibleFrom="xs">
              {percentual(c.valor)}
            </Table.Td>
          </Table.Tr>
        ))}
        {semCategoria > 0 && (
          <Table.Tr>
            <Table.Td pl={20}>
              <Text size="sm" c="orange.8">
                Sem categoria
              </Text>
            </Table.Td>
            <Table.Td ta="right">{moeda(semCategoria)}</Table.Td>
            <Table.Td ta="right" c="dimmed" visibleFrom="xs">
              {percentual(semCategoria)}
            </Table.Td>
          </Table.Tr>
        )}
        {contas.length === 0 && semCategoria === 0 && (
          <Table.Tr>
            <Table.Td colSpan={2} pl={20}>
              <Text size="sm" c="dimmed">
                Nada no período.
              </Text>
            </Table.Td>
          </Table.Tr>
        )}
      </Fragment>
    );
  };

  return (
    <>
      <Cabecalho titulo="DRE" descricao="Demonstração do resultado: receitas menos despesas no período, por categoria" />
      <Stack>
        <Card withBorder>
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <CampoData label="De" value={de} onChange={setDe} />
            <CampoData label="Até" value={ate} onChange={setAte} />
            <Stack gap={4}>
              <Text size="sm" fw={500}>
                Regime
              </Text>
              <SegmentedControl value={regime} onChange={(v) => setRegime(v as RegimeDre)} data={REGIMES} />
            </Stack>
          </SimpleGrid>
          <Group justify="space-between" mt="sm" wrap="wrap">
            <Group gap="xs">
              {ATALHOS.map((a) => {
                const p = a.periodo();
                return (
                  <Button
                    key={a.rotulo}
                    size="compact-sm"
                    variant={p.de === de && p.ate === ate ? 'light' : 'subtle'}
                    onClick={() => {
                      setDe(p.de);
                      setAte(p.ate);
                    }}
                  >
                    {a.rotulo}
                  </Button>
                );
              })}
            </Group>
            <Text size="xs" c="dimmed">
              {REGIMES.find((r) => r.value === regime)?.explicacao}
            </Text>
          </Group>
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
            <Table.ScrollContainer minWidth={320}>
              <Table verticalSpacing={6} style={{ fontVariantNumeric: 'tabular-nums' }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>
                      {data(dre.data.de)} a {data(dre.data.ate)}
                    </Table.Th>
                    <Table.Th ta="right" w={140}>
                      Valor
                    </Table.Th>
                    <Table.Th ta="right" w={110} title="Percentual sobre as receitas" visibleFrom="xs">
                      % receita
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {secao('RECEITA', 'Receitas', dre.data.receitas, dre.data.semCategoria.receitas)}
                  {secao('DESPESA', 'Despesas', dre.data.despesas, dre.data.semCategoria.despesas)}
                </Table.Tbody>
                <Table.Tfoot>
                  <Table.Tr>
                    <Table.Th fz="md">{dre.data.resultado >= 0 ? 'Lucro' : 'Prejuízo'} no período</Table.Th>
                    <Table.Th ta="right" fz="md" c={dre.data.resultado < 0 ? 'red.7' : 'teal.8'}>
                      {moeda(dre.data.resultado)}
                    </Table.Th>
                    <Table.Th ta="right" c="dimmed" visibleFrom="xs">
                      {percentual(dre.data.resultado)}
                    </Table.Th>
                  </Table.Tr>
                </Table.Tfoot>
              </Table>
            </Table.ScrollContainer>
          </Card>
        )}
        {dre.data && (dre.data.semCategoria.receitas > 0 || dre.data.semCategoria.despesas > 0) && (
          <Text size="xs" c="dimmed">
            Lançamentos sem categoria entram no total, mas não aparecem em nenhuma linha do plano de contas. Classifique-os nas contas a
            receber e a pagar para um resultado mais detalhado.
          </Text>
        )}
      </Stack>
    </>
  );
}

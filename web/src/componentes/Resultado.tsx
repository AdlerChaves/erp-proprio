import { Button, Group, SegmentedControl, SimpleGrid, Stack, Table, Text } from '@mantine/core';
import dayjs from 'dayjs';
import { Fragment, type ReactNode } from 'react';
import type { Dre, RegimeDre, TipoPlanoConta } from '../api/tipos';
import { data, hoje, mesDe, moeda } from '../util/formato';
import { CampoData } from './comum';

/** Períodos prontos dos relatórios de resultado (DRE e resumo do centro de custo). */
export const ATALHOS = [
  { rotulo: 'Este mês', periodo: () => mesDe(hoje()) },
  { rotulo: 'Mês passado', periodo: () => mesDe(dayjs().subtract(1, 'month').format('YYYY-MM-DD')) },
  { rotulo: 'Este ano', periodo: () => ({ de: dayjs().startOf('year').format('YYYY-MM-DD'), ate: dayjs().endOf('year').format('YYYY-MM-DD') }) },
  {
    rotulo: 'Últimos 12 meses',
    periodo: () => ({ de: dayjs().subtract(11, 'month').startOf('month').format('YYYY-MM-DD'), ate: dayjs().endOf('month').format('YYYY-MM-DD') }),
  },
];

export const REGIMES: { value: RegimeDre; label: string; explicacao: string }[] = [
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

interface PropsFiltro {
  de: string | null;
  ate: string | null;
  regime: RegimeDre;
  aoMudarPeriodo: (de: string | null, ate: string | null) => void;
  aoMudarRegime: (regime: RegimeDre) => void;
  /** Campo a mais na primeira linha (ex.: o centro de custo no DRE). */
  extra?: ReactNode;
}

/** Período (com atalhos) e regime de competência ou caixa. */
export function FiltroResultado({ de, ate, regime, aoMudarPeriodo, aoMudarRegime, extra }: PropsFiltro) {
  return (
    <>
      <SimpleGrid cols={{ base: 1, sm: extra ? 4 : 3 }}>
        <CampoData label="De" value={de} onChange={(v) => aoMudarPeriodo(v, ate)} />
        <CampoData label="Até" value={ate} onChange={(v) => aoMudarPeriodo(de, v)} />
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Regime
          </Text>
          <SegmentedControl value={regime} onChange={(v) => aoMudarRegime(v as RegimeDre)} data={REGIMES} />
        </Stack>
        {extra}
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
                onClick={() => aoMudarPeriodo(p.de, p.ate)}
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
    </>
  );
}

type DadosResultado = Pick<Dre, 'de' | 'ate' | 'contas' | 'semCategoria' | 'receitas' | 'despesas' | 'resultado'>;

/** Receitas e despesas por categoria do plano de contas, com o percentual sobre a receita e o resultado. */
export function TabelaResultado({ resultado: r }: { resultado: DadosResultado }) {
  const percentual = (valor: number) => (r.receitas > 0 ? `${((valor / r.receitas) * 100).toFixed(1).replace('.', ',')}%` : '');

  const secao = (tipo: TipoPlanoConta, titulo: string, total: number, semCategoria: number) => {
    const doTipo = r.contas.filter((c) => c.tipo === tipo);
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
    <Table.ScrollContainer minWidth={320}>
      <Table verticalSpacing={6} style={{ fontVariantNumeric: 'tabular-nums' }}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>
              {data(r.de)} a {data(r.ate)}
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
          {secao('RECEITA', 'Receitas', r.receitas, r.semCategoria.receitas)}
          {secao('DESPESA', 'Despesas', r.despesas, r.semCategoria.despesas)}
        </Table.Tbody>
        <Table.Tfoot>
          <Table.Tr>
            <Table.Th fz="md">{r.resultado >= 0 ? 'Lucro' : 'Prejuízo'} no período</Table.Th>
            <Table.Th ta="right" fz="md" c={r.resultado < 0 ? 'red.7' : 'teal.8'}>
              {moeda(r.resultado)}
            </Table.Th>
            <Table.Th ta="right" c="dimmed" visibleFrom="xs">
              {percentual(r.resultado)}
            </Table.Th>
          </Table.Tr>
        </Table.Tfoot>
      </Table>
    </Table.ScrollContainer>
  );
}

/** Aviso para quando há valores sem categoria. */
export function AvisoSemCategoria({ resultado }: { resultado: Pick<Dre, 'semCategoria'> }) {
  if (resultado.semCategoria.receitas <= 0 && resultado.semCategoria.despesas <= 0) return null;
  return (
    <Text size="xs" c="dimmed">
      Lançamentos sem categoria entram no total, mas não aparecem em nenhuma linha do plano de contas. Classifique-os nas contas a
      receber e a pagar para um resultado mais detalhado.
    </Text>
  );
}

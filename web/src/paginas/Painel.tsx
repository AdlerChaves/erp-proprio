import { Alert, Card, Group, Loader, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { api, consulta } from '../api/cliente';
import type { FluxoCaixa, Saldos } from '../api/tipos';
import { Cabecalho, ErroCarregamento } from '../componentes/comum';
import { useSessao } from '../sessao/sessao';
import { mesAno, moeda } from '../util/formato';

const MESES_PROJETADOS = 6;

function Indicador({ rotulo, valor, cor, detalhe }: { rotulo: string; valor: number; cor?: string; detalhe?: string }) {
  return (
    <Card withBorder padding="lg">
      <Text size="sm" c="dimmed">
        {rotulo}
      </Text>
      <Text fz={26} fw={700} c={cor ?? (valor < 0 ? 'red.7' : undefined)} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {moeda(valor)}
      </Text>
      {detalhe && (
        <Text size="xs" c="dimmed">
          {detalhe}
        </Text>
      )}
    </Card>
  );
}

export function Painel() {
  const { me, pode } = useSessao();
  const permitido = pode('verSaldos');
  const de = dayjs().startOf('month').format('YYYY-MM-DD');
  const ate = dayjs().add(MESES_PROJETADOS - 1, 'month').endOf('month').format('YYYY-MM-DD');

  const saldos = useQuery({ queryKey: ['saldos'], queryFn: () => api.get<Saldos>('/movimentacoes/saldos'), enabled: permitido });
  const fluxo = useQuery({
    queryKey: ['fluxo-caixa', de, ate],
    queryFn: () => api.get<FluxoCaixa>(`/financeiro/fluxo-caixa${consulta({ de, ate, agrupamento: 'mes' })}`),
    enabled: permitido,
  });

  const saudacao = `Olá, ${me?.usuario.nome.split(' ')[0]}`;
  const aberturas = fluxo.data?.periodos.reduce((soma, p) => soma + p.aberturas, 0) ?? 0;
  if (!permitido) {
    return (
      <>
        <Cabecalho titulo={saudacao} />
        <Alert icon={<IconInfoCircle size={18} />} color="blue">
          Seu perfil não tem acesso aos saldos e ao fluxo de caixa. Use o menu para trabalhar com clientes e contas.
        </Alert>
      </>
    );
  }
  if (saldos.isPending || fluxo.isPending) return <Loader />;
  if (saldos.isError || fluxo.isError) return <ErroCarregamento erro={saldos.error ?? fluxo.error} />;

  return (
    <Stack gap="lg">
      <Cabecalho titulo={saudacao} descricao="Situação financeira de hoje e projeção dos próximos meses" />

      <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }}>
        <Indicador rotulo="Saldo em contas" valor={saldos.data.total} />
        <Indicador rotulo="A receber em atraso" valor={fluxo.data.emAtraso.receber} cor={fluxo.data.emAtraso.receber > 0 ? 'orange.7' : undefined} />
        <Indicador rotulo="A pagar em atraso" valor={fluxo.data.emAtraso.pagar} cor={fluxo.data.emAtraso.pagar > 0 ? 'red.7' : undefined} />
        <Indicador
          rotulo="Saldo projetado"
          valor={fluxo.data.saldoFinal}
          detalhe={`Ao fim de ${mesAno(fluxo.data.ate.slice(0, 7))}`}
        />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 3 }}>
        <Card withBorder padding="lg" style={{ gridColumn: 'span 2' }}>
          <Title order={4} mb="sm">
            Fluxo de caixa
          </Title>
          <Table.ScrollContainer minWidth={560}>
            <Table striped highlightOnHover style={{ fontVariantNumeric: 'tabular-nums' }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Mês</Table.Th>
                  <Table.Th ta="right">Recebido</Table.Th>
                  <Table.Th ta="right">Pago</Table.Th>
                  <Table.Th ta="right">A receber</Table.Th>
                  <Table.Th ta="right">A pagar</Table.Th>
                  <Table.Th ta="right">Saldo</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {fluxo.data.periodos.map((p) => (
                  <Table.Tr key={p.periodo}>
                    <Table.Td>{mesAno(p.periodo)}</Table.Td>
                    <Table.Td ta="right">{moeda(p.realizado.entradas)}</Table.Td>
                    <Table.Td ta="right">{moeda(p.realizado.saidas)}</Table.Td>
                    <Table.Td ta="right">{moeda(p.previsto.entradas)}</Table.Td>
                    <Table.Td ta="right">{moeda(p.previsto.saidas)}</Table.Td>
                    <Table.Td ta="right" fw={600} c={p.saldo < 0 ? 'red.7' : undefined}>
                      {moeda(p.saldo)}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          <Text size="xs" c="dimmed" mt="xs">
            O saldo de cada mês soma o que já entrou e saiu com o que ainda vence, partindo de {moeda(fluxo.data.saldoInicial)}
            {aberturas > 0 && `, mais ${moeda(aberturas)} de saldo inicial de contas abertas no período`}.
          </Text>
        </Card>

        <Card withBorder padding="lg">
          <Title order={4} mb="sm">
            Saldo por conta
          </Title>
          {saldos.data.contas.length === 0 ? (
            <Text c="dimmed" size="sm">
              Nenhuma conta bancária cadastrada.
            </Text>
          ) : (
            <Stack gap="xs">
              {saldos.data.contas.map((c) => (
                <Group key={c.contaBancaria.id} justify="space-between" wrap="nowrap">
                  <Text size="sm" c={c.contaBancaria.ativo ? undefined : 'dimmed'} lineClamp={1}>
                    {c.contaBancaria.nome}
                  </Text>
                  <Text size="sm" fw={600} c={c.saldo < 0 ? 'red.7' : undefined} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {moeda(c.saldo)}
                  </Text>
                </Group>
              ))}
            </Stack>
          )}
        </Card>
      </SimpleGrid>
    </Stack>
  );
}

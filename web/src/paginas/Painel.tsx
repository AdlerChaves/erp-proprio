import { Alert, Anchor, Box, Card, Group, Loader, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { api, consulta } from '../api/cliente';
import type { FluxoCaixa, Saldos } from '../api/tipos';
import { Cabecalho, ErroCarregamento } from '../componentes/comum';
import { useSessao } from '../sessao/sessao';
import { Link } from 'react-router-dom';
import { mesAno, moeda } from '../util/formato';
import { type DadosProjecao, indicadores, projetar } from '../util/projecao';

const MESES_PROJETADOS = 6;

/**
 * Número de destaque do painel, em preto. Um ponto colorido ao lado do rótulo marca o que pede atenção, para o
 * alerta não se perder no meio de números todos coloridos.
 */
function Indicador({ rotulo, valor, alerta, detalhe }: { rotulo: string; valor: number; alerta?: 'red' | 'orange'; detalhe?: string }) {
  // O ponto sinaliza o alerta; o valor só fica vermelho quando é negativo.
  const ponto = alerta ?? (valor < 0 ? 'red' : undefined);
  return (
    <Card withBorder padding="md" px="lg">
      <Group gap={6} wrap="nowrap">
        {ponto && <Box w={7} h={7} bg={`${ponto}.6`} style={{ borderRadius: '50%', flexShrink: 0 }} />}
        <Text size="sm" c="dimmed" fw={500}>
          {rotulo}
        </Text>
      </Group>
      <Text fz={25} fw={600} mt={6} lts="-0.02em" c={valor < 0 ? 'red.8' : undefined} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {moeda(valor)}
      </Text>
      <Text size="xs" c="dimmed" mt={2}>
        {detalhe ?? '\u00a0'}
      </Text>
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

  // Projeção até o mesmo fim do fluxo de caixa, no cenário prudente (sem contar com os atrasados dos clientes):
  // dá o aviso de caixa negativo e o saldo projetado, já com as contas vencidas a pagar.
  const projecao = useQuery({
    queryKey: ['projecao', ate],
    queryFn: () => api.get<DadosProjecao>(`/financeiro/projecao${consulta({ ate })}`),
    enabled: permitido,
  });
  const negativo = projecao.data ? indicadores(projetar(projecao.data, { atrasadosReceber: false, contratos: true, recorrentes: true })) : null;

  const saudacao = `Olá, ${me?.usuario.nome.split(' ')[0]}`;
  // "Sexta-feira, 30 de outubro"
  const hojePorExtenso = dayjs().format('dddd, D [de] MMMM').replace(/^./, (c) => c.toUpperCase());
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
    <Stack gap="md">
      <Cabecalho titulo={saudacao} descricao={`${hojePorExtenso} · situação financeira de hoje e projeção dos próximos meses`} />

      {negativo?.negativo && (
        <Alert color="red" variant="light" icon={<IconAlertTriangle size={20} />}>
          <Group justify="space-between" gap="xs" wrap="wrap">
            <Text size="sm">
              <b>O caixa fica negativo em {dayjs(negativo.negativo.data).format('DD/MM')}</b>
              {negativo.negativo.dias > 0 ? `, daqui a ${negativo.negativo.dias} dia${negativo.negativo.dias === 1 ? '' : 's'}` : ', hoje'}, e chega a{' '}
              {moeda(negativo.menor.valor / 100)} em {dayjs(negativo.menor.data).format('DD/MM')}.
            </Text>
            <Anchor component={Link} to="/projecao" size="sm" fw={500}>
              Ver a projeção e simular
            </Anchor>
          </Group>
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }}>
        <Indicador rotulo="Saldo em contas" valor={saldos.data.total} detalhe={`${saldos.data.contas.length} conta${saldos.data.contas.length === 1 ? '' : 's'}`} />
        <Indicador
          rotulo="A receber em atraso"
          valor={fluxo.data.emAtraso.receber}
          alerta={fluxo.data.emAtraso.receber > 0 ? 'orange' : undefined}
          detalhe={fluxo.data.emAtraso.receber > 0 ? 'Cobrar os clientes' : 'Nada em atraso'}
        />
        <Indicador
          rotulo="A pagar em atraso"
          valor={fluxo.data.emAtraso.pagar}
          alerta={fluxo.data.emAtraso.pagar > 0 ? 'red' : undefined}
          detalhe={fluxo.data.emAtraso.pagar > 0 ? 'Vencido e ainda não pago' : 'Nada em atraso'}
        />
        <Indicador
          rotulo="Saldo projetado"
          valor={negativo ? negativo.final / 100 : fluxo.data.saldoFinal}
          detalhe={`Ao fim de ${mesAno(fluxo.data.ate.slice(0, 7))}, já com as contas vencidas`}
        />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 3 }}>
        <Card withBorder padding="lg" style={{ gridColumn: 'span 2' }}>
          <Title order={4} mb="sm">
            Fluxo de caixa
          </Title>
          <Table.ScrollContainer minWidth={560}>
            <Table highlightOnHover>
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
            Não inclui as contas já vencidas (veja os atrasos acima); a projeção do caixa inclui. O saldo de cada mês soma o que já entrou e saiu com o que ainda
            vence, partindo de {moeda(fluxo.data.saldoInicial)}
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

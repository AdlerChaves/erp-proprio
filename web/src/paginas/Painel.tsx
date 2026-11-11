import { Anchor, Badge, Box, Button, Grid, Group, Modal, SegmentedControl, Skeleton, Stack, Table, Text } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { type ReactNode, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, consulta } from '../api/cliente';
import type { ContaFinanceira, FluxoCaixa, Saldos } from '../api/tipos';
import { useVencimentos } from '../api/vencimentos';
import { Cabecalho, ErroCarregamento, EstadoVazio, FaixaMetricas, Metrica, Secao, SubSecao, Valor } from '../componentes/comum';
import { GraficoCaixa } from '../componentes/GraficoCaixa';
import { useSessao } from '../sessao/sessao';
import { hoje, mesAno, moeda } from '../util/formato';
import { agrupar, type DadosProjecao, indicadores, nivelPara, projetar } from '../util/projecao';
import { diasDeAtraso, fluxoCompacto, rotuloVencimento } from '../util/vencimentos';
import { type ConfigContas, FormBaixa, PAGAR, RECEBER } from './Contas';

const PERIODOS = [
  { label: '3 meses', value: '3' },
  { label: '6 meses', value: '6' },
  { label: '12 meses', value: '12' },
];
/** Atrasadas mostradas no painel; a lista completa fica na tela de contas. */
const ATRASADAS_NO_PAINEL = 5;

const plural = (n: number, singular: string, pluralForma: string) => `${n} ${n === 1 ? singular : pluralForma}`;
const dataCurta = (d: string) => dayjs(d).format('DD/MM');

export function Painel() {
  const { pode } = useSessao();
  const verSaldos = pode('verSaldos');
  const escrever = pode('escreverFinanceiro');
  const [meses, setMeses] = useState('6');
  const dia = hoje();
  const de = dayjs(dia).startOf('month').format('YYYY-MM-DD');
  const ate = dayjs(dia)
    .add(Number(meses) - 1, 'month')
    .endOf('month')
    .format('YYYY-MM-DD');

  const saldos = useQuery({
    queryKey: ['saldos'],
    queryFn: () => api.get<Saldos>('/movimentacoes/saldos'),
    enabled: verSaldos,
  });
  const fluxo = useQuery({
    queryKey: ['fluxo-caixa', de, ate],
    queryFn: () => api.get<FluxoCaixa>(`/financeiro/fluxo-caixa${consulta({ de, ate, agrupamento: 'mes' })}`),
    enabled: verSaldos,
    placeholderData: keepPreviousData,
  });
  // Cenário prudente: sem contar com os atrasados dos clientes, já pagando as contas vencidas.
  const projecao = useQuery({
    queryKey: ['projecao', ate],
    queryFn: () => api.get<DadosProjecao>(`/financeiro/projecao${consulta({ ate })}`),
    enabled: verSaldos,
    placeholderData: keepPreviousData,
  });
  const pagar = useVencimentos('/contas-pagar');
  const receber = useVencimentos('/contas-receber');

  const caixa = useMemo(() => {
    if (!projecao.data) return null;
    const serie = projetar(projecao.data, {
      atrasadosReceber: false,
      contratos: true,
      recorrentes: true,
    });
    const nivel = nivelPara(serie.length);
    return {
      serie,
      nivel,
      periodos: agrupar(serie, nivel),
      ind: indicadores(serie),
    };
  }, [projecao.data]);

  // "Terça-feira, 10 de novembro de 2026"
  const hojePorExtenso = dayjs(dia)
    .format('dddd, D [de] MMMM [de] YYYY')
    .replace(/^./, (c) => c.toUpperCase());
  const acoes = escrever && (
    <>
      <Button variant="default" component={Link} to="/contas-receber?nova=1">
        Nova conta a receber
      </Button>
      <Button component={Link} to="/contas-pagar?nova=1">
        Nova conta a pagar
      </Button>
    </>
  );

  // Perfis sem acesso a saldos veem o que vence, que é o que podem consultar.
  if (!verSaldos) {
    return (
      <>
        <Cabecalho titulo="Painel" descricao={hojePorExtenso} acoes={acoes} />
        <Vencimentos escrever={escrever} pagar={pagar} receber={receber} />
      </>
    );
  }

  const atrasoReceber = receber.resumo?.atrasadas ?? [];
  const atrasoPagar = pagar.resumo?.atrasadas ?? [];
  const semContas = saldos.data?.contas.length === 0;

  return (
    <>
      <Cabecalho titulo="Painel" descricao={hojePorExtenso} acoes={acoes} />
      <Stack gap="lg">
        {saldos.isError || fluxo.isError ? (
          <ErroCarregamento
            erro={saldos.error ?? fluxo.error}
            aoTentarDeNovo={() => {
              saldos.refetch();
              fluxo.refetch();
            }}
          />
        ) : !saldos.data || !fluxo.data ? (
          <Skeleton h={98} radius="md" />
        ) : (
          <FaixaMetricas>
            <Metrica
              rotulo="Saldo em contas"
              valor={<Valor valor={saldos.data.total} />}
              detalhe={
                saldos.data.contas.length <= 2
                  ? saldos.data.contas.map((c) => c.contaBancaria.nome).join(' e ') || 'Nenhuma conta bancária'
                  : plural(saldos.data.contas.length, 'conta', 'contas')
              }
            />
            <Metrica
              rotulo="A receber em atraso"
              selo={fluxo.data.emAtraso.receber > 0 && <Badge color="ambar">Cobrar</Badge>}
              valor={<Valor valor={fluxo.data.emAtraso.receber} />}
              detalhe={
                fluxo.data.emAtraso.receber > 0
                  ? atrasoReceber.length > 0 && plural(atrasoReceber.length, 'conta de cliente', 'contas de clientes')
                  : 'Nada em atraso'
              }
            />
            <Metrica
              rotulo="A pagar em atraso"
              selo={fluxo.data.emAtraso.pagar > 0 && <Badge color="red">Vencido</Badge>}
              valor={<Valor valor={fluxo.data.emAtraso.pagar} />}
              detalhe={
                fluxo.data.emAtraso.pagar > 0
                  ? atrasoPagar.length > 0 && `${plural(atrasoPagar.length, 'conta', 'contas')}, a mais antiga de ${dataCurta(atrasoPagar[0].dataVencimento)}`
                  : 'Nada em atraso'
              }
            />
            <Metrica
              rotulo="Menor saldo previsto"
              valor={caixa ? <Valor valor={caixa.ind.menor.valor / 100} /> : projecao.isError ? '—' : <Skeleton h={30} w="70%" mt={2} />}
              detalhe={caixa && `Em ${dayjs(caixa.ind.menor.data).format('DD/MM/YYYY')}, já com as contas vencidas`}
            />
          </FaixaMetricas>
        )}

        <Secao
          titulo={`Caixa previsto até ${mesAno(ate.slice(0, 7))}`}
          acao={<SegmentedControl data={PERIODOS} value={meses} onChange={setMeses} aria-label="Período da projeção" />}
        >
          {semContas ? (
            <EstadoVazio
              mensagem="Cadastre a primeira conta bancária para ver o caixa e a projeção dos próximos meses."
              acao={
                <Button variant="default" component={Link} to="/contas-bancarias">
                  Cadastrar conta bancária
                </Button>
              }
            />
          ) : projecao.isError ? (
            <Box p="md">
              <ErroCarregamento erro={projecao.error} aoTentarDeNovo={() => projecao.refetch()} />
            </Box>
          ) : !caixa ? (
            <Box p="md">
              <Skeleton h={330} />
            </Box>
          ) : (
            <>
              {caixa.ind.negativo && (
                <Group justify="space-between" gap="xs" wrap="wrap" px="md" py={10} bg="var(--relda-critico-fundo)">
                  <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
                    <Box w={8} h={8} bg="red.9" style={{ borderRadius: '50%', flexShrink: 0 }} />
                    <Text size="sm">
                      <b>
                        O caixa fica negativo{' '}
                        {caixa.ind.negativo.dias === 0
                          ? 'hoje'
                          : `em ${dataCurta(caixa.ind.negativo.data)}, daqui a ${plural(caixa.ind.negativo.dias, 'dia', 'dias')}`}
                      </b>
                      , já contando as contas vencidas, e chega a {moeda(caixa.ind.menor.valor / 100)} em {dataCurta(caixa.ind.menor.data)}.
                    </Text>
                  </Group>
                  <Anchor component={Link} to="/projecao" size="sm" fw={500} c="red.9">
                    Simular na projeção
                  </Anchor>
                </Group>
              )}
              <Box
                px="xs"
                pt="xs"
                style={{
                  opacity: projecao.isPlaceholderData ? 0.5 : 1,
                  transition: 'opacity 150ms',
                }}
              >
                <GraficoCaixa serie={caixa.serie} base={null} periodos={caixa.periodos} nivel={caixa.nivel} />
              </Box>
            </>
          )}
        </Secao>

        <Grid gap="lg">
          <Grid.Col span={{ base: 12, lg: 7 }}>
            <Vencimentos escrever={escrever} pagar={pagar} receber={receber} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 5 }}>
            <Stack gap="lg">
              <SaldoPorConta saldos={saldos.data} erro={saldos.error} />
              <FluxoPorMes fluxo={fluxo.data} erro={fluxo.error} atualizando={fluxo.isPlaceholderData} />
            </Stack>
          </Grid.Col>
        </Grid>
      </Stack>
    </>
  );
}

type Vencimento = ReturnType<typeof useVencimentos>;

/** O que vence nos próximos dias e o que já venceu, com o pagamento ou recebimento na própria linha. */
function Vencimentos({ escrever, pagar, receber }: { escrever: boolean; pagar: Vencimento; receber: Vencimento }) {
  const [aba, setAba] = useState<'pagar' | 'receber'>('pagar');
  const [baixando, setBaixando] = useState<{
    config: ConfigContas;
    conta: ContaFinanceira;
  } | null>(null);
  const dia = hoje();
  const config = aba === 'pagar' ? PAGAR : RECEBER;
  const atual = aba === 'pagar' ? pagar : receber;
  const contagem = (v: Vencimento) => (v.resumo ? ` (${v.resumo.proximas.length})` : '');

  const linhas = (contas: ContaFinanceira[], coluna: (c: ContaFinanceira) => ReactNode) => (
    <Table.ScrollContainer minWidth={520} type="native">
      <Table highlightOnHover>
        <Table.Tbody>
          {contas.map((c) => (
            <Table.Tr key={c.id}>
              <Table.Td w={96}>{coluna(c)}</Table.Td>
              <Table.Td>
                <Text size="sm" lineClamp={1}>
                  {c.descricao}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm" c="dimmed" lineClamp={1}>
                  {c[config.pessoa.relacao]?.nome}
                </Text>
              </Table.Td>
              <Table.Td ta="right">
                <Valor valor={c.saldo} />
              </Table.Td>
              {escrever && (
                <Table.Td w={1} ta="right">
                  <Button size="compact-sm" variant="default" onClick={() => setBaixando({ config, conta: c })}>
                    {config.verbo}
                  </Button>
                </Table.Td>
              )}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );

  const nome = aba === 'pagar' ? 'a pagar' : 'a receber';
  const atrasadas = atual.resumo?.atrasadas ?? [];

  return (
    <Secao
      titulo="Vence nos próximos 7 dias"
      acao={
        <SegmentedControl
          value={aba}
          onChange={(v) => setAba(v as 'pagar' | 'receber')}
          data={[
            { label: `A pagar${contagem(pagar)}`, value: 'pagar' },
            { label: `A receber${contagem(receber)}`, value: 'receber' },
          ]}
          aria-label="Contas a pagar ou a receber"
        />
      }
    >
      {atual.isError ? (
        <Box p="md">
          <ErroCarregamento erro={atual.error} aoTentarDeNovo={() => atual.refetch()} />
        </Box>
      ) : !atual.resumo ? (
        <Stack gap={6} p="md">
          <Skeleton h={28} />
          <Skeleton h={28} />
          <Skeleton h={28} />
        </Stack>
      ) : (
        <>
          {atual.resumo.proximas.length === 0 ? (
            <EstadoVazio mensagem={`Nada ${nome} nos próximos 7 dias.`} />
          ) : (
            linhas(atual.resumo.proximas, (c) => (
              <Text size="sm" fw={c.dataVencimento === dia ? 600 : undefined}>
                {rotuloVencimento(c.dataVencimento, dia)}
              </Text>
            ))
          )}
          <SubSecao
            titulo="Em atraso"
            acao={
              atrasadas.length > 0 && (
                <Anchor component={Link} to={config.rota} size="sm" fw={500}>
                  {atrasadas.length > ATRASADAS_NO_PAINEL ? `Ver as ${atrasadas.length} contas` : `Abrir contas ${nome}`}
                </Anchor>
              )
            }
          />
          {atrasadas.length === 0 ? (
            <EstadoVazio mensagem={`Nenhuma conta ${nome} em atraso.`} />
          ) : (
            linhas(atrasadas.slice(0, ATRASADAS_NO_PAINEL), (c) => <Badge color="red">{plural(diasDeAtraso(c.dataVencimento, dia), 'dia', 'dias')}</Badge>)
          )}
        </>
      )}
      <Modal opened={baixando !== null} onClose={() => setBaixando(null)} title={`${baixando?.config.verbo ?? ''} conta`} size="lg">
        {baixando && <FormBaixa config={baixando.config} conta={baixando.conta} aoFechar={() => setBaixando(null)} />}
      </Modal>
    </Secao>
  );
}

function SaldoPorConta({ saldos, erro }: { saldos: Saldos | undefined; erro: Error | null }) {
  return (
    <Secao
      titulo="Saldo por conta"
      acao={
        <Anchor component={Link} to="/extrato" size="sm" fw={500}>
          Extrato
        </Anchor>
      }
    >
      {erro ? (
        <Box p="md">
          <ErroCarregamento erro={erro} />
        </Box>
      ) : !saldos ? (
        <Box p="md">
          <Skeleton h={80} />
        </Box>
      ) : saldos.contas.length === 0 ? (
        <EstadoVazio
          mensagem="Nenhuma conta bancária cadastrada."
          acao={
            <Button variant="default" size="xs" component={Link} to="/contas-bancarias">
              Cadastrar conta bancária
            </Button>
          }
        />
      ) : (
        <Table>
          <Table.Tbody>
            {saldos.contas.map((c) => (
              <Table.Tr key={c.contaBancaria.id}>
                <Table.Td c={c.contaBancaria.ativo ? undefined : 'dimmed'}>{c.contaBancaria.nome}</Table.Td>
                <Table.Td ta="right">
                  <Valor valor={c.saldo} forte />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
          {saldos.contas.length > 1 && (
            <Table.Tfoot>
              <Table.Tr>
                <Table.Th>Total</Table.Th>
                <Table.Th ta="right">
                  <Valor valor={saldos.total} forte />
                </Table.Th>
              </Table.Tr>
            </Table.Tfoot>
          )}
        </Table>
      )}
    </Secao>
  );
}

/** Entra, sai e saldo de cada mês; a tabela completa, com realizado e previsto separados, abre em "Detalhar". */
function FluxoPorMes({ fluxo, erro, atualizando }: { fluxo: FluxoCaixa | undefined; erro: Error | null; atualizando: boolean }) {
  const [detalhe, setDetalhe] = useState(false);
  const aberturas = fluxo?.periodos.reduce((soma, p) => soma + p.aberturas, 0) ?? 0;

  return (
    <Secao
      titulo="Fluxo por mês"
      acao={
        fluxo && (
          <Anchor component="button" type="button" size="sm" fw={500} onClick={() => setDetalhe(true)}>
            Detalhar
          </Anchor>
        )
      }
    >
      {erro ? (
        <Box p="md">
          <ErroCarregamento erro={erro} />
        </Box>
      ) : !fluxo ? (
        <Box p="md">
          <Skeleton h={160} />
        </Box>
      ) : (
        <Table.ScrollContainer minWidth={380} type="native">
          <Table style={{ opacity: atualizando ? 0.5 : 1 }}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Mês</Table.Th>
                <Table.Th ta="right">Entra</Table.Th>
                <Table.Th ta="right">Sai</Table.Th>
                <Table.Th ta="right">Saldo</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {fluxoCompacto(fluxo.periodos).map((p) => (
                <Table.Tr key={p.periodo}>
                  <Table.Td>{mesAno(p.periodo)}</Table.Td>
                  <Table.Td ta="right">
                    <Valor valor={p.entra} />
                  </Table.Td>
                  <Table.Td ta="right">
                    <Valor valor={p.sai} />
                  </Table.Td>
                  <Table.Td ta="right">
                    <Valor valor={p.saldo} forte />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <Modal opened={detalhe} onClose={() => setDetalhe(false)} title="Fluxo de caixa por mês" size="xl">
        {fluxo && (
          <Stack gap="sm">
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
                  {fluxo.periodos.map((p) => (
                    <Table.Tr key={p.periodo}>
                      <Table.Td>{mesAno(p.periodo)}</Table.Td>
                      <Table.Td ta="right">
                        <Valor valor={p.realizado.entradas} />
                      </Table.Td>
                      <Table.Td ta="right">
                        <Valor valor={p.realizado.saidas} />
                      </Table.Td>
                      <Table.Td ta="right">
                        <Valor valor={p.previsto.entradas} />
                      </Table.Td>
                      <Table.Td ta="right">
                        <Valor valor={p.previsto.saidas} />
                      </Table.Td>
                      <Table.Td ta="right">
                        <Valor valor={p.saldo} forte />
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            <Text size="xs" c="dimmed">
              Não inclui as contas já vencidas (veja os atrasos no painel); a projeção do caixa inclui. O saldo de cada mês soma o que já entrou e saiu com o
              que ainda vence, partindo de {moeda(fluxo.saldoInicial)}
              {aberturas > 0 && `, mais ${moeda(aberturas)} de saldo inicial de contas abertas no período`}.
            </Text>
          </Stack>
        )}
      </Modal>
    </Secao>
  );
}

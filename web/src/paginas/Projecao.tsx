import { Alert, Box, Button, Card, Grid, Group, Loader, NumberInput, SegmentedControl, SimpleGrid, Stack, Switch, Table, Text, Title } from '@mantine/core';
import { IconAlertTriangle, IconCircleCheck, IconInfoCircle } from '@tabler/icons-react';
import { useMediaQuery } from '@mantine/hooks';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { api, consulta } from '../api/cliente';
import { Cabecalho, CampoData, CampoMoeda, ErroCarregamento, SemPermissao } from '../componentes/comum';
import { CORES_CAIXA, GraficoCaixa } from '../componentes/GraficoCaixa';
import { useSessao } from '../sessao/sessao';
import { moeda } from '../util/formato';
import {
  agrupar,
  type Cenario,
  type DadosProjecao,
  indicadores,
  type Indicadores,
  nivelPara,
  projetar,
  SEM_SIMULACAO,
  type Simulacao,
  simulando,
} from '../util/projecao';

const PERIODOS = [
  { value: '30', label: '30 dias', curto: '30d' },
  { value: '90', label: '3 meses', curto: '3m' },
  { value: '180', label: '6 meses', curto: '6m' },
  { value: '365', label: '12 meses', curto: '12m' },
  { value: '730', label: '24 meses', curto: '24m' },
];

const ddmm = (data: string) => dayjs(data).format('DD/MM');
const reais = (centavos: number) => moeda(centavos / 100);
const plural = (n: number, palavra: string) => `${n} ${palavra}${n === 1 ? '' : 's'}`;

/** Um número-chave: rótulo, valor e uma linha de contexto; o ponto colorido marca alerta (vermelho) ou tranquilidade. */
function Numero({ rotulo, valor, detalhe, ponto, negativo }: { rotulo: string; valor: string; detalhe?: string; ponto?: 'red' | 'teal'; negativo?: boolean }) {
  return (
    <Card withBorder padding="md" px="lg">
      <Group gap={6} wrap="nowrap">
        {ponto && <Box w={7} h={7} bg={`${ponto}.6`} style={{ borderRadius: '50%', flexShrink: 0 }} />}
        <Text size="sm" c="dimmed" fw={500}>
          {rotulo}
        </Text>
      </Group>
      <Text fz={24} fw={600} mt={6} lts="-0.02em" c={negativo ? 'red.8' : undefined}>
        {valor}
      </Text>
      <Text size="xs" c="dimmed" mt={2}>
        {detalhe ?? ' '}
      </Text>
    </Card>
  );
}

/** O diagnóstico em uma frase: quando o caixa fica negativo e quanto falta, ou qual é a folga do período. */
function Diagnostico({
  ind,
  dados,
  cenario,
  comSimulacao,
  estimado,
}: {
  ind: Indicadores;
  dados: DadosProjecao;
  cenario: Cenario;
  comSimulacao: boolean;
  /** Centavos de saídas do período que ainda são previsão. */
  estimado: number;
}) {
  const prefixo = comSimulacao ? 'Com a simulação, o' : 'Mantidas as contas atuais, o';
  const notas: string[] = [];
  if (dados.atrasados.pagar > 0) notas.push(`Inclui ${moeda(dados.atrasados.pagar)} em contas a pagar já vencidas, consideradas pagas hoje.`);
  if (!cenario.atrasadosReceber && dados.atrasados.receber > 0) {
    notas.push(`Os ${moeda(dados.atrasados.receber)} que clientes devem em atraso não entram na conta (cenário prudente).`);
  }
  if (estimado > 0) notas.push(`${reais(estimado)} das saídas são estimativas (despesas que variam ou dependem do faturamento).`);
  const rodape = notas.length > 0 && (
    <Text size="xs" c="dimmed" mt={6}>
      {notas.join(' ')}
    </Text>
  );
  if (ind.negativo) {
    const quando = ind.negativo.dias > 0 ? `, daqui a ${plural(ind.negativo.dias, 'dia')}` : ', hoje';
    return (
      <Alert color="red" variant="light" icon={<IconAlertTriangle size={20} />} title={`O caixa fica negativo em ${ddmm(ind.negativo.data)}${quando}`}>
        <Text size="sm">
          {prefixo} saldo chega a {reais(ind.menor.valor)} em {ddmm(ind.menor.data)}. Para atravessar o período sem ficar no vermelho, a empresa precisa de mais{' '}
          <b>{reais(-ind.menor.valor)}</b> até {ddmm(ind.negativo.data)}: em novas vendas ou contratos, cobrando os atrasados, antecipando recebimentos, adiando
          pagamentos ou cortando custos.
        </Text>
        {rodape}
      </Alert>
    );
  }
  return (
    <Alert color="teal" variant="light" icon={<IconCircleCheck size={20} />} title={`O caixa se mantém positivo até ${ddmm(dados.ate)}`}>
      <Text size="sm">
        {prefixo} ponto mais baixo é <b>{reais(ind.menor.valor)}</b> em {ddmm(ind.menor.data)}. Essa é a folga do período: o quanto dá para retirar ou investir a mais
        sem ficar negativo, se nada mais mudar.
      </Text>
      {rodape}
    </Alert>
  );
}

/** "E se...?": entradas e saídas mensais a mais (ou a menos) e um gasto único. */
function PainelSimulacao({ simulacao, aoMudar, com, sem }: { simulacao: Simulacao; aoMudar: (s: Simulacao) => void; com: Indicadores; sem: Indicadores }) {
  const ativa = simulando(simulacao);
  const numero = (v: number | string) => Number(v) || 0;
  return (
    <Card withBorder padding="lg">
      <Title order={4}>E se...?</Title>
      <Text size="sm" c="dimmed" mb="md">
        Teste uma decisão antes de tomá-la. A simulação não grava nada.
      </Text>
      <Stack gap="sm">
        <CampoMoeda
          label="Mais entradas por mês"
          description="Um novo contrato, mais vendas"
          value={simulacao.entradaMensal}
          onChange={(v) => aoMudar({ ...simulacao, entradaMensal: numero(v) })}
        />
        <CampoMoeda
          label="Mais saídas por mês"
          description="Pró-labore maior, contratação. Valor negativo simula corte de custos"
          value={simulacao.saidaMensal}
          onChange={(v) => aoMudar({ ...simulacao, saidaMensal: numero(v) })}
        />
        <NumberInput
          label="Todo dia"
          description="Dia do mês dessas entradas e saídas"
          min={1}
          max={31}
          allowDecimal={false}
          value={simulacao.diaDoMes}
          onChange={(v) => aoMudar({ ...simulacao, diaDoMes: Math.min(31, Math.max(1, numero(v) || 1)) })}
        />
        <SimpleGrid cols={2} spacing="sm">
          <CampoMoeda
            label="Gasto único"
            description="Equipamento, reforma"
            allowNegative={false}
            value={simulacao.gastoUnico}
            onChange={(v) => aoMudar({ ...simulacao, gastoUnico: numero(v) })}
          />
          <CampoData
            label="Em"
            description="Data do gasto"
            minDate={dayjs().format('YYYY-MM-DD')}
            clearable
            value={simulacao.dataGastoUnico}
            onChange={(v) => aoMudar({ ...simulacao, dataGastoUnico: v ? String(v).slice(0, 10) : null })}
          />
        </SimpleGrid>
        {ativa && (
          <Box p="sm" bg="var(--relda-fundo)" style={{ borderRadius: 8 }}>
            <Text size="sm">
              Menor saldo: <b>{reais(com.menor.valor)}</b>{' '}
              <Text span size="xs" c="dimmed">
                (era {reais(sem.menor.valor)})
              </Text>
            </Text>
            <Text size="sm">
              No fim: <b>{reais(com.final)}</b>{' '}
              <Text span size="xs" c="dimmed">
                (era {reais(sem.final)})
              </Text>
            </Text>
            <Text size="sm">
              {com.negativo ? `Fica negativo em ${ddmm(com.negativo.data)}` : 'Não fica negativo no período'}
              {sem.negativo && (!com.negativo || com.negativo.data !== sem.negativo.data) && (
                <Text span size="xs" c="dimmed">
                  {' '}
                  (era {ddmm(sem.negativo.data)})
                </Text>
              )}
            </Text>
          </Box>
        )}
        {ativa && (
          <Button variant="default" onClick={() => aoMudar({ ...SEM_SIMULACAO, diaDoMes: simulacao.diaDoMes })}>
            Limpar simulação
          </Button>
        )}
      </Stack>
    </Card>
  );
}

const chaveLegenda = (cor: string, forma: 'linha' | 'barra') => (
  <Box w={forma === 'linha' ? 14 : 10} h={forma === 'linha' ? 2 : 10} bg={cor} style={{ borderRadius: forma === 'linha' ? 1 : 2, flexShrink: 0 }} />
);

export function Projecao() {
  const { pode } = useSessao();
  const [dias, setDias] = useState('90');
  const [cenario, setCenario] = useState<Cenario>({ atrasadosReceber: false, contratos: true, recorrentes: true });
  const [simulacao, setSimulacao] = useState<Simulacao>(SEM_SIMULACAO);
  const [visao, setVisao] = useState<'grafico' | 'tabela'>('grafico');
  const celular = useMediaQuery('(max-width: 36em)');
  const ate = dayjs().add(Number(dias), 'day').format('YYYY-MM-DD');
  const projecao = useQuery({
    queryKey: ['projecao', ate],
    queryFn: () => api.get<DadosProjecao>(`/financeiro/projecao${consulta({ ate })}`),
    enabled: pode('verSaldos'),
    // Ao trocar o período, o gráfico anterior fica na tela, mais claro, até os dados novos chegarem.
    placeholderData: keepPreviousData,
  });

  const calculo = useMemo(() => {
    if (!projecao.data) return null;
    const ativa = simulando(simulacao);
    const semSimulacao = projetar(projecao.data, cenario);
    const serie = ativa ? projetar(projecao.data, cenario, simulacao) : semSimulacao;
    const nivel = nivelPara(serie.length);
    return {
      ativa,
      serie,
      base: ativa ? semSimulacao : null,
      ind: indicadores(serie),
      indSem: indicadores(semSimulacao),
      nivel,
      periodos: agrupar(serie, nivel),
      temContratos: projecao.data.dias.some((d) => d.contratos > 0),
      temRecorrentes: projecao.data.dias.some((d) => d.recorrentes > 0),
      // Quanto das saídas do período ainda é previsão (despesa variável ou sobre o faturamento).
      estimado: serie.reduce((s, d) => s + d.lancamentos.filter((l) => l.estimado).reduce((t, l) => t + Math.round(Math.abs(l.valor) * 100), 0), 0),
    };
  }, [projecao.data, cenario, simulacao]);

  if (!pode('verSaldos')) return <SemPermissao titulo="Projeção do caixa" />;

  return (
    <Stack gap="md">
      <Cabecalho
        titulo="Projeção do caixa"
        descricao="Quanto a empresa terá em conta a cada dia, com as contas a pagar e a receber em aberto. Simule decisões antes de tomá-las."
      />

      <Group gap="lg" wrap="wrap">
        <SegmentedControl value={dias} onChange={setDias} data={PERIODOS.map((p) => ({ value: p.value, label: celular ? p.curto : p.label }))} aria-label="Período da projeção" />
        {projecao.data && projecao.data.atrasados.receber > 0 && (
          <Switch
            label={`Contar com os ${moeda(projecao.data.atrasados.receber)} em atraso dos clientes`}
            checked={cenario.atrasadosReceber}
            onChange={(e) => setCenario({ ...cenario, atrasadosReceber: e.currentTarget.checked })}
          />
        )}
        {calculo?.temRecorrentes && (
          <Switch
            label="Incluir despesas recorrentes ainda não lançadas"
            checked={cenario.recorrentes}
            onChange={(e) => setCenario({ ...cenario, recorrentes: e.currentTarget.checked })}
          />
        )}
        {calculo?.temContratos && (
          <Switch
            label="Incluir mensalidades de contratos a faturar"
            checked={cenario.contratos}
            onChange={(e) => setCenario({ ...cenario, contratos: e.currentTarget.checked })}
          />
        )}
      </Group>

      {projecao.isPending ? (
        <Loader />
      ) : projecao.isError ? (
        <ErroCarregamento erro={projecao.error} />
      ) : (
        calculo && (
          <Stack gap="md" style={{ opacity: projecao.isPlaceholderData ? 0.55 : 1, transition: 'opacity 150ms' }}>
            <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }}>
              <Numero
                rotulo="Saldo em conta hoje"
                valor={moeda(projecao.data.saldoAtual)}
                negativo={projecao.data.saldoAtual < 0}
                detalhe={projecao.data.contasBancarias.length === 1 ? '1 conta bancária' : `${projecao.data.contasBancarias.length} contas bancárias`}
              />
              {calculo.ind.negativo ? (
                <Numero
                  rotulo="Fica negativo em"
                  ponto="red"
                  valor={dayjs(calculo.ind.negativo.data).format('DD/MM/YYYY')}
                  detalhe={calculo.ind.negativo.dias === 0 ? 'Hoje' : `Daqui a ${plural(calculo.ind.negativo.dias, 'dia')}`}
                />
              ) : (
                <Numero rotulo="Fica negativo em" ponto="teal" valor="Não fica" detalhe={`Até ${dayjs(projecao.data.ate).format('DD/MM/YYYY')}`} />
              )}
              <Numero
                rotulo="Menor saldo do período"
                valor={reais(calculo.ind.menor.valor)}
                negativo={calculo.ind.menor.valor < 0}
                detalhe={`Em ${dayjs(calculo.ind.menor.data).format('DD/MM/YYYY')}${calculo.ativa ? ` · era ${reais(calculo.indSem.menor.valor)}` : ''}`}
              />
              <Numero
                rotulo={`Saldo em ${dayjs(projecao.data.ate).format('DD/MM/YYYY')}`}
                valor={reais(calculo.ind.final)}
                negativo={calculo.ind.final < 0}
                detalhe={`Entram ${reais(calculo.ind.entradas)} · saem ${reais(calculo.ind.saidas)}`}
              />
            </SimpleGrid>

            <Diagnostico ind={calculo.ind} dados={projecao.data} cenario={cenario} comSimulacao={calculo.ativa} estimado={calculo.estimado} />

            <Grid gap="md">
              <Grid.Col span={{ base: 12, lg: 8 }}>
                <Card withBorder padding="lg">
                  <Group justify="space-between" mb="xs" wrap="wrap" gap="sm">
                    <div>
                      <Title order={4}>Saldo projetado</Title>
                      <Text size="xs" c="dimmed">
                        Saldo no fim de cada dia. Passe o mouse (ou use as setas) para ver o que vence em cada dia.
                      </Text>
                    </div>
                    <SegmentedControl
                      size="xs"
                      value={visao}
                      onChange={(v) => setVisao(v as typeof visao)}
                      data={[
                        { value: 'grafico', label: 'Gráfico' },
                        { value: 'tabela', label: 'Tabela' },
                      ]}
                    />
                  </Group>
                  <Group gap="md" mb={4} wrap="wrap">
                    {calculo.ativa && (
                      <>
                        <Group gap={6} wrap="nowrap">
                          {chaveLegenda(CORES_CAIXA.positivo, 'linha')}
                          <Text size="xs">Com a simulação</Text>
                        </Group>
                        <Group gap={6} wrap="nowrap">
                          {chaveLegenda(CORES_CAIXA.base, 'linha')}
                          <Text size="xs">Sem a simulação</Text>
                        </Group>
                      </>
                    )}
                    <Group gap={6} wrap="nowrap">
                      {chaveLegenda(CORES_CAIXA.entrada, 'barra')}
                      <Text size="xs">Entradas (a receber e contratos)</Text>
                    </Group>
                    <Group gap={6} wrap="nowrap">
                      {chaveLegenda(CORES_CAIXA.saida, 'barra')}
                      <Text size="xs">Saídas (a pagar e despesas recorrentes)</Text>
                    </Group>
                  </Group>
                  {visao === 'grafico' ? (
                    <GraficoCaixa serie={calculo.serie} base={calculo.base} periodos={calculo.periodos} nivel={calculo.nivel} />
                  ) : (
                    <Table.ScrollContainer minWidth={520} mah={420}>
                      <Table stickyHeader highlightOnHover>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>{calculo.nivel === 'dia' ? 'Dia' : calculo.nivel === 'semana' ? 'Semana' : 'Mês'}</Table.Th>
                            <Table.Th ta="right">Entradas</Table.Th>
                            <Table.Th ta="right">Saídas</Table.Th>
                            <Table.Th ta="right">Menor saldo</Table.Th>
                            <Table.Th ta="right">Saldo no fim</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {calculo.periodos.map((p) => (
                            <Table.Tr key={p.inicio}>
                              <Table.Td>
                                {calculo.nivel === 'mes'
                                  ? dayjs(p.inicio).format('MMMM [de] YYYY')
                                  : p.inicio === p.fim
                                    ? dayjs(p.inicio).format('DD/MM/YYYY')
                                    : `${ddmm(p.inicio)} a ${ddmm(p.fim)}`}
                              </Table.Td>
                              <Table.Td ta="right">{p.entradas ? reais(p.entradas) : '—'}</Table.Td>
                              <Table.Td ta="right">{p.saidas ? reais(p.saidas) : '—'}</Table.Td>
                              <Table.Td ta="right" c={p.menor < 0 ? 'red.8' : undefined}>
                                {reais(p.menor)}
                              </Table.Td>
                              <Table.Td ta="right" fw={500} c={p.saldo < 0 ? 'red.8' : undefined}>
                                {reais(p.saldo)}
                              </Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    </Table.ScrollContainer>
                  )}
                </Card>
              </Grid.Col>
              <Grid.Col span={{ base: 12, lg: 4 }}>
                <PainelSimulacao simulacao={simulacao} aoMudar={setSimulacao} com={calculo.ind} sem={calculo.indSem} />
                <Text size="xs" c="dimmed" mt="sm" px={4}>
                  <IconInfoCircle size={13} style={{ verticalAlign: -2 }} /> A projeção usa o saldo das contas bancárias de hoje e as contas a pagar e a receber em
                  aberto, pelo vencimento, as mensalidades de contratos e as despesas recorrentes ainda não lançadas (no dia útil do vencimento);
                  faturas de cartão entram como contas a pagar. Valores com ~ são estimativas. O que não está cadastrado no ERP não aparece.
                </Text>
              </Grid.Col>
            </Grid>
          </Stack>
        )
      )}
    </Stack>
  );
}

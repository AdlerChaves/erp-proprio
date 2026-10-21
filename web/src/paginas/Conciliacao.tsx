import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  FileButton,
  Group,
  Loader,
  Modal,
  Select,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconFileImport, IconWand } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, consulta } from '../api/cliente';
import type {
  CentroCusto,
  ContaBancaria,
  ContaFinanceira,
  LinhaExtrato,
  PainelConciliacao,
  PlanoConta,
  ResultadoImportacao,
} from '../api/tipos';
import {
  avisarErro,
  avisarSucesso,
  Cabecalho,
  CampoData,
  CampoMoeda,
  ErroCarregamento,
  MenuAcoes,
  SemPermissao,
} from '../componentes/comum';
import { useSessao } from '../sessao/sessao';
import { data, hoje, moeda } from '../util/formato';

const STATUS: Record<LinhaExtrato['status'], { rotulo: string; cor: string }> = {
  PENDENTE: { rotulo: 'Pendente', cor: 'yellow' },
  CONCILIADA: { rotulo: 'Conciliada', cor: 'teal' },
  IGNORADA: { rotulo: 'Ignorada', cor: 'gray' },
};

/** Lê o arquivo como bytes e codifica em base64: a API decide a codificação (Windows-1252 ou UTF-8) pelo próprio OFX. */
async function base64(arquivo: File) {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binario);
}

function useInvalidar() {
  const queryClient = useQueryClient();
  return () => {
    for (const chave of ['conciliacao', 'extrato', 'saldos', 'fluxo-caixa', 'dre', '/contas-receber', '/contas-pagar', 'fatura-cartao']) {
      queryClient.invalidateQueries({ queryKey: [chave] });
    }
  };
}

const valorComSinal = (l: { tipo: string; valor: number }) => (l.tipo === 'SAIDA' ? `− ${moeda(l.valor)}` : moeda(l.valor));

function FormAvulsa({ linha, aoFechar }: { linha: LinhaExtrato; aoFechar: () => void }) {
  const invalidar = useInvalidar();
  const plano = useQuery({
    queryKey: ['/plano-contas'],
    queryFn: () => api.get<PlanoConta[]>('/plano-contas'),
  });
  const centros = useQuery({
    queryKey: ['/centros-custo'],
    queryFn: () => api.get<CentroCusto[]>('/centros-custo'),
  });
  const tipoCategoria = linha.tipo === 'ENTRADA' ? 'RECEITA' : 'DESPESA';
  const form = useForm({
    initialValues: {
      descricao: linha.descricao,
      planoContaId: null as string | null,
      centroCustoId: null as string | null,
    },
  });
  const salvar = useMutation({
    mutationFn: (v: typeof form.values) =>
      api.post(`/conciliacao/linhas/${linha.id}/avulsa`, {
        descricao: v.descricao.trim() || undefined,
        planoContaId: v.planoContaId ?? undefined,
        centroCustoId: v.centroCustoId ?? undefined,
      }),
    onSuccess: () => {
      invalidar();
      avisarSucesso('Lançado e conciliado');
      aoFechar();
    },
    onError: avisarErro,
  });
  return (
    <form onSubmit={form.onSubmit((v) => salvar.mutate(v))}>
      <Stack>
        <Text size="sm">
          {data(linha.data)} · <b>{valorComSinal(linha)}</b> · lançamento avulso na conta (tarifa, rendimento, ajuste)
        </Text>
        <TextInput label="Descrição" data-autofocus {...form.getInputProps('descricao')} />
        <Select
          label="Categoria"
          description="Entra na DRE"
          data={(plano.data ?? [])
            .filter((c) => c.tipo === tipoCategoria && c.aceitaLancamento && c.ativo)
            .map((c) => ({ value: c.id, label: `${c.codigo} ${c.nome}` }))}
          searchable
          clearable
          {...form.getInputProps('planoContaId')}
        />
        <Select
          label="Centro de custo"
          placeholder="Opcional"
          data={(centros.data ?? []).filter((c) => c.ativo).map((c) => ({ value: c.id, label: c.nome }))}
          clearable
          {...form.getInputProps('centroCustoId')}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" loading={salvar.isPending}>
            Lançar e conciliar
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

function FormBaixa({ linha, contaInicial, aoFechar }: { linha: LinhaExtrato; contaInicial: string | null; aoFechar: () => void }) {
  const invalidar = useInvalidar();
  const entrada = linha.tipo === 'ENTRADA';
  const rota = entrada ? '/contas-receber' : '/contas-pagar';
  const contas = useQuery({
    queryKey: [rota, 'abertas'],
    queryFn: () => api.get<ContaFinanceira[]>(rota),
  });
  const abertas = (contas.data ?? []).filter((c) => c.status === 'ABERTA' || c.status === 'PARCIAL');
  const [contaId, setContaId] = useState<string | null>(contaInicial);
  const [quitar, setQuitar] = useState(false);
  const [multa, setMulta] = useState<number | ''>('');
  const conta = abertas.find((c) => c.id === contaId);
  const diferenca = conta ? Math.round((linha.valor - conta.saldo) * 100) / 100 : 0;

  const baixar = useMutation({
    mutationFn: () =>
      api.post(`/conciliacao/linhas/${linha.id}/baixa`, {
        contaId,
        quitarComDesconto: quitar || undefined,
        multa: multa === '' ? undefined : Number(multa),
      }),
    onSuccess: () => {
      invalidar();
      avisarSucesso(entrada ? 'Recebimento registrado e conciliado' : 'Pagamento registrado e conciliado');
      aoFechar();
    },
    onError: avisarErro,
  });

  return (
    <Stack>
      <Text size="sm">
        {data(linha.data)} · <b>{valorComSinal(linha)}</b> · {linha.descricao}
      </Text>
      <Select
        label={entrada ? 'Conta a receber' : 'Conta a pagar'}
        placeholder={contas.isPending ? 'Carregando…' : 'Busque pela descrição ou pelo nome'}
        data={abertas
          .sort((x, y) => Math.abs(x.saldo - linha.valor) - Math.abs(y.saldo - linha.valor))
          .map((c) => ({
            value: c.id,
            label: `${c.descricao} · ${(c.cliente ?? c.fornecedor)?.nome ?? ''} · vence ${data(c.dataVencimento)} · saldo ${moeda(c.saldo)}`,
          }))}
        searchable
        value={contaId}
        onChange={(v) => {
          setContaId(v);
          setQuitar(false);
          setMulta('');
        }}
        nothingFoundMessage="Nenhuma conta em aberto"
        comboboxProps={{ width: 'target' }}
      />
      {conta && diferenca > 0 && (
        <Alert color="blue" p="xs">
          <Text size="sm">
            O banco mostra {moeda(diferenca)} a mais que o saldo da conta: a diferença entra como juros
            {entrada ? ' recebidos' : ' pagos'}. Se parte for multa, informe:
          </Text>
          <CampoMoeda mt="xs" w={180} label="Multa" value={multa} onChange={(v) => setMulta(v === '' ? '' : Number(v))} />
        </Alert>
      )}
      {conta && diferenca < 0 && (
        <Checkbox
          checked={quitar}
          onChange={(e) => setQuitar(e.currentTarget.checked)}
          label={`Quitar a conta com desconto de ${moeda(-diferenca)} (sem marcar, fica pagamento parcial e sobra ${moeda(-diferenca)} em aberto)`}
        />
      )}
      <Group justify="flex-end">
        <Button variant="default" onClick={aoFechar}>
          Cancelar
        </Button>
        <Button disabled={!contaId} loading={baixar.isPending} onClick={() => baixar.mutate()}>
          {entrada ? 'Registrar recebimento' : 'Registrar pagamento'}
        </Button>
      </Group>
    </Stack>
  );
}

/** O que a linha do banco tem no sistema: a movimentação conciliada ou as sugestões. */
function LadoSistema({
  linha,
  escrever,
  aoConciliar,
  aoBaixar,
}: {
  linha: LinhaExtrato;
  escrever: boolean;
  aoConciliar: (movId: string) => void;
  aoBaixar: (contaId: string) => void;
}) {
  if (linha.status === 'CONCILIADA' && linha.movimentacao) {
    return (
      <Text size="sm">
        {linha.movimentacao.descricao}
        <Text span size="xs" c="dimmed" ml={6}>
          {data(linha.movimentacao.data)}
        </Text>
      </Text>
    );
  }
  if (linha.status === 'IGNORADA')
    return (
      <Text size="sm" c="dimmed">
        Sem lançamento no sistema
      </Text>
    );
  if (linha.sugestoes.length === 0 && linha.contasSugeridas.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Nada com este valor no sistema
      </Text>
    );
  }
  return (
    <Stack gap={4}>
      {linha.sugestoes.slice(0, 2).map((s) => (
        <Group key={s.id} gap="xs" wrap="nowrap">
          <Text size="sm" lineClamp={1}>
            {s.descricao}
            <Text span size="xs" c="dimmed" ml={6}>
              {data(s.data)}
            </Text>
          </Text>
          {escrever && (
            <Button size="compact-xs" variant="light" style={{ flexShrink: 0 }} onClick={() => aoConciliar(s.id)}>
              Conciliar
            </Button>
          )}
        </Group>
      ))}
      {linha.contasSugeridas.slice(0, 2).map((c) => (
        <Group key={c.id} gap="xs" wrap="nowrap">
          <Text size="sm" lineClamp={1}>
            Em aberto: {c.descricao} · {c.pessoa}
            <Text span size="xs" c="dimmed" ml={6}>
              vence {data(c.dataVencimento)}
            </Text>
          </Text>
          {escrever && (
            <Button size="compact-xs" variant="light" color="grape" style={{ flexShrink: 0 }} onClick={() => aoBaixar(c.id)}>
              {linha.tipo === 'ENTRADA' ? 'Receber' : 'Pagar'}
            </Button>
          )}
        </Group>
      ))}
    </Stack>
  );
}

export function Conciliacao() {
  const { pode } = useSessao();
  const invalidar = useInvalidar();
  const [parametros, setParametros] = useSearchParams();
  const [de, setDe] = useState<string | null>(dayjs().subtract(30, 'day').format('YYYY-MM-DD'));
  const [ate, setAte] = useState<string | null>(hoje());
  const [filtro, setFiltro] = useState<'PENDENTE' | 'CONCILIADA' | 'IGNORADA' | 'TODAS'>('PENDENTE');
  const [avisos, setAvisos] = useState<string[]>([]);
  const [avulsa, setAvulsa] = useState<LinhaExtrato | null>(null);
  const [baixa, setBaixa] = useState<{
    linha: LinhaExtrato;
    contaId: string | null;
  } | null>(null);
  const permitido = pode('verSaldos');
  const escrever = pode('escreverFinanceiro');
  // Sem limpar, escolher o mesmo arquivo de novo não dispara a importação (o navegador não vê mudança).
  const limparArquivo = useRef<() => void>(null);

  const contas = useQuery({
    queryKey: ['/contas-bancarias'],
    queryFn: () => api.get<ContaBancaria[]>('/contas-bancarias'),
    enabled: permitido,
  });
  const ativas = (contas.data ?? []).filter((c) => c.ativo && c.tipo !== 'CAIXA');
  const contaId = parametros.get('conta') ?? ativas[0]?.id ?? null;
  const filtroApi = consulta({ contaBancariaId: contaId, de, ate });
  const painel = useQuery({
    queryKey: ['conciliacao', filtroApi],
    queryFn: () => api.get<PainelConciliacao>(`/conciliacao${filtroApi}`),
    enabled: permitido && !!contaId && !!de && !!ate && de <= ate,
  });

  const importar = useMutation({
    mutationFn: async (arquivo: File) =>
      api.post<ResultadoImportacao>('/conciliacao/importacoes', {
        contaBancariaId: contaId,
        nomeArquivo: arquivo.name,
        conteudo: await base64(arquivo),
      }),
    onSuccess: (r) => {
      invalidar();
      setAvisos(r.avisos);
      notifications.show({
        color: 'teal',
        title: 'Extrato importado',
        message: `${r.novas} transação(ões) nova(s), ${r.repetidas} já importada(s); ${r.conciliadasAutomaticamente} conciliada(s) automaticamente.`,
        autoClose: 8000,
      });
    },
    onError: avisarErro,
    onSettled: () => limparArquivo.current?.(),
  });
  const automatica = useMutation({
    mutationFn: () => api.post<{ conciliadas: number }>(`/conciliacao/automatica/${contaId}`),
    onSuccess: (r) => {
      invalidar();
      avisarSucesso(r.conciliadas ? `${r.conciliadas} linha(s) conciliada(s)` : 'Nenhuma linha com par único para conciliar');
    },
    onError: avisarErro,
  });
  const acao = useMutation({
    mutationFn: ({
      linha,
      tipo,
      movimentacaoId,
    }: {
      linha: LinhaExtrato;
      tipo: 'conciliar' | 'desfazer' | 'ignorar';
      movimentacaoId?: string;
    }) =>
      tipo === 'conciliar'
        ? api.post(`/conciliacao/linhas/${linha.id}/conciliacao`, {
            movimentacaoId,
          })
        : tipo === 'desfazer'
          ? api.delete(`/conciliacao/linhas/${linha.id}/conciliacao`)
          : api.post(`/conciliacao/linhas/${linha.id}/ignorar`),
    onSuccess: (_, { tipo }) => {
      invalidar();
      avisarSucesso(tipo === 'conciliar' ? 'Conciliada' : tipo === 'desfazer' ? 'Voltou para pendente' : 'Linha ignorada');
    },
    onError: avisarErro,
  });

  if (!permitido) return <SemPermissao titulo="Conciliação bancária" />;
  const p = painel.data;
  const linhas = (p?.linhas ?? []).filter((l) => filtro === 'TODAS' || l.status === filtro);

  return (
    <>
      <Cabecalho
        titulo="Conciliação bancária"
        descricao="Importe o extrato do banco (OFX) e confira cada linha com o que está no sistema"
        acoes={
          escrever &&
          contaId && (
            <>
              <Button
                variant="default"
                leftSection={<IconWand size={16} />}
                loading={automatica.isPending}
                onClick={() => automatica.mutate()}
              >
                Conciliar automaticamente
              </Button>
              <FileButton
                resetRef={limparArquivo}
                onChange={(arquivo) => arquivo && importar.mutate(arquivo)}
                accept=".ofx,.OFX,application/x-ofx"
              >
                {(props) => (
                  <Button {...props} leftSection={<IconFileImport size={16} />} loading={importar.isPending}>
                    Importar OFX
                  </Button>
                )}
              </FileButton>
            </>
          )
        }
      />
      <Stack>
        <Card withBorder>
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <Select
              label="Conta"
              data={ativas.map((c) => ({ value: c.id, label: c.nome }))}
              value={contaId}
              onChange={(v) => v && setParametros({ conta: v }, { replace: true })}
              allowDeselect={false}
              placeholder={contas.isPending ? 'Carregando…' : 'Cadastre uma conta bancária'}
            />
            <CampoData label="De" value={de} onChange={setDe} />
            <CampoData label="Até" value={ate} onChange={setAte} />
          </SimpleGrid>
          {p?.ultimaImportacao && (
            <Text size="xs" c="dimmed" mt="xs">
              Último arquivo: {p.ultimaImportacao.nomeArquivo}
              {p.ultimaImportacao.de && ` (${data(p.ultimaImportacao.de)} a ${data(p.ultimaImportacao.ate)})`}. No internet banking, procure
              por "exportar extrato" no formato OFX (Money).
            </Text>
          )}
        </Card>

        {avisos.length > 0 && (
          <Alert color="orange" withCloseButton onClose={() => setAvisos([])}>
            {avisos.map((a) => (
              <Text key={a} size="sm">
                {a}
              </Text>
            ))}
          </Alert>
        )}

        {painel.isPending && contaId ? (
          <Loader />
        ) : painel.isError ? (
          <ErroCarregamento erro={painel.error} />
        ) : !p ? null : (
          <>
            <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }}>
              <Card withBorder>
                <Text size="xs" c="dimmed">
                  Pendentes
                </Text>
                <Text fw={700} fz={24} c={p.resumo.pendentes ? 'yellow.8' : 'teal.8'}>
                  {p.resumo.pendentes}
                </Text>
              </Card>
              {p.saldos ? (
                <>
                  <Card withBorder>
                    <Text size="xs" c="dimmed">
                      Saldo no banco em {data(p.saldos.data)}
                    </Text>
                    <Text fw={700} fz={20} style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {moeda(p.saldos.banco)}
                    </Text>
                  </Card>
                  <Card withBorder>
                    <Text size="xs" c="dimmed">
                      Saldo no sistema na mesma data
                    </Text>
                    <Text fw={700} fz={20} style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {moeda(p.saldos.sistema)}
                    </Text>
                  </Card>
                  <Card withBorder>
                    <Text size="xs" c="dimmed">
                      Diferença
                    </Text>
                    <Text fw={700} fz={20} c={p.saldos.diferenca === 0 ? 'teal.8' : 'red.7'} style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {p.saldos.diferenca === 0 ? 'Bateu' : moeda(p.saldos.diferenca)}
                    </Text>
                  </Card>
                </>
              ) : (
                <Card withBorder style={{ gridColumn: 'span 3' }}>
                  <Text size="sm" c="dimmed">
                    Importe um extrato OFX para comparar o saldo do banco com o do sistema.
                  </Text>
                </Card>
              )}
            </SimpleGrid>

            <Card withBorder padding={0}>
              <Group p="md" justify="space-between" wrap="wrap">
                <Title order={5}>Extrato do banco</Title>
                {/* No celular, o filtro rola de lado em vez de sair da tela. */}
                <div style={{ maxWidth: '100%', overflowX: 'auto' }}>
                  <SegmentedControl
                    size="xs"
                    value={filtro}
                    onChange={(v) => setFiltro(v as typeof filtro)}
                    data={[
                      {
                        value: 'PENDENTE',
                        label: `Pendentes (${p.resumo.pendentes})`,
                      },
                      {
                        value: 'CONCILIADA',
                        label: `Conciliadas (${p.resumo.conciliadas})`,
                      },
                      {
                        value: 'IGNORADA',
                        label: `Ignoradas (${p.resumo.ignoradas})`,
                      },
                      { value: 'TODAS', label: 'Todas' },
                    ]}
                  />
                </div>
              </Group>
              {linhas.length === 0 ? (
                <Text c="dimmed" p="md" size="sm">
                  {p.linhas.length === 0 ? 'Nenhuma linha do banco neste período. Importe o OFX do extrato.' : 'Nada aqui.'}
                </Text>
              ) : (
                <Table.ScrollContainer minWidth={820}>
                  <Table verticalSpacing="sm" highlightOnHover style={{ fontVariantNumeric: 'tabular-nums' }}>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th w={100}>Data</Table.Th>
                        <Table.Th>No banco</Table.Th>
                        <Table.Th ta="right" w={130}>
                          Valor
                        </Table.Th>
                        <Table.Th w={130}>Situação</Table.Th>
                        <Table.Th>No sistema</Table.Th>
                        {escrever && <Table.Th w={48} />}
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {linhas.map((l) => (
                        <Table.Tr key={l.id}>
                          <Table.Td>{data(l.data)}</Table.Td>
                          <Table.Td>
                            <Text size="sm" lineClamp={2}>
                              {l.descricao}
                            </Text>
                          </Table.Td>
                          <Table.Td ta="right" fw={500} c={l.tipo === 'SAIDA' ? 'red.7' : 'teal.8'}>
                            {valorComSinal(l)}
                          </Table.Td>
                          <Table.Td>
                            <Badge variant="light" color={STATUS[l.status].cor}>
                              {STATUS[l.status].rotulo}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <LadoSistema
                              linha={l}
                              escrever={escrever}
                              aoConciliar={(movimentacaoId) =>
                                acao.mutate({
                                  linha: l,
                                  tipo: 'conciliar',
                                  movimentacaoId,
                                })
                              }
                              aoBaixar={(contaId) => setBaixa({ linha: l, contaId })}
                            />
                          </Table.Td>
                          {escrever && (
                            <Table.Td>
                              <MenuAcoes
                                rotulo={l.descricao}
                                itens={[
                                  l.status === 'PENDENTE' && {
                                    texto: l.tipo === 'ENTRADA' ? 'Receber conta em aberto…' : 'Pagar conta em aberto…',
                                    aoClicar: () => setBaixa({ linha: l, contaId: null }),
                                  },
                                  l.status === 'PENDENTE' && {
                                    texto: 'Lançar como avulso (tarifa, rendimento)…',
                                    aoClicar: () => setAvulsa(l),
                                  },
                                  l.status === 'PENDENTE' && {
                                    texto: 'Ignorar',
                                    aoClicar: () =>
                                      acao.mutate({
                                        linha: l,
                                        tipo: 'ignorar',
                                      }),
                                  },
                                  l.status !== 'PENDENTE' && {
                                    texto: 'Desfazer',
                                    aoClicar: () =>
                                      acao.mutate({
                                        linha: l,
                                        tipo: 'desfazer',
                                      }),
                                  },
                                ]}
                              />
                            </Table.Td>
                          )}
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              )}
            </Card>

            {p.semPar.length > 0 && (
              <Card withBorder padding={0}>
                <Title order={5} p="md" pb={4}>
                  No sistema, sem linha correspondente no extrato
                </Title>
                <Text size="xs" c="dimmed" px="md" pb="sm">
                  Lançamentos da conta neste período que o banco não mostrou: confira se a data está certa ou se o extrato importado cobre o
                  período.
                </Text>
                <Table.ScrollContainer minWidth={520}>
                  <Table verticalSpacing="xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    <Table.Tbody>
                      {p.semPar.map((m) => (
                        <Table.Tr key={m.id}>
                          <Table.Td w={100}>{data(m.data)}</Table.Td>
                          <Table.Td>{m.descricao}</Table.Td>
                          <Table.Td ta="right" w={130} c={m.tipo === 'SAIDA' ? 'red.7' : 'teal.8'}>
                            {valorComSinal(m)}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              </Card>
            )}
          </>
        )}
      </Stack>

      <Modal opened={avulsa !== null} onClose={() => setAvulsa(null)} title="Lançar como avulso" size="lg">
        {avulsa && <FormAvulsa linha={avulsa} aoFechar={() => setAvulsa(null)} />}
      </Modal>
      <Modal
        opened={baixa !== null}
        onClose={() => setBaixa(null)}
        title={baixa?.linha.tipo === 'ENTRADA' ? 'Receber conta em aberto' : 'Pagar conta em aberto'}
        size="xl"
      >
        {baixa && <FormBaixa linha={baixa.linha} contaInicial={baixa.contaId} aoFechar={() => setBaixa(null)} />}
      </Modal>
    </>
  );
}

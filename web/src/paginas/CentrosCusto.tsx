import { Badge, Button, Card, Group, Loader, Modal, Paper, SimpleGrid, Stack, Switch, Table, Tabs, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMediaQuery } from '@mantine/hooks';
import { IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, consulta } from '../api/cliente';
import type { CentroCusto, OrigemLancamento, RegimeDre, ResumoCentroCusto } from '../api/tipos';
import { avisarErro, avisarSucesso, Cabecalho, Confirmacao, ErroCarregamento, MenuAcoes, SituacaoAtivo } from '../componentes/comum';
import { ATALHOS, AvisoSemCategoria, FiltroResultado, TabelaResultado } from '../componentes/Resultado';
import { useSessao } from '../sessao/sessao';
import { data, moeda } from '../util/formato';

function FormCentro({ centro, aoFechar }: { centro: CentroCusto | null; aoFechar: () => void }) {
  const queryClient = useQueryClient();
  const form = useForm({
    initialValues: { nome: centro?.nome ?? '', descricao: centro?.descricao ?? '', ativo: centro?.ativo ?? true },
    validate: { nome: (v) => (v.trim() ? null : 'Informe um nome, como "Loja centro" ou "Projeto X"') },
  });
  const salvar = useMutation({
    mutationFn: (v: typeof form.values) => {
      const corpo = { nome: v.nome.trim(), descricao: v.descricao.trim() || undefined, ativo: v.ativo };
      return centro ? api.patch(`/centros-custo/${centro.id}`, corpo) : api.post('/centros-custo', corpo);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/centros-custo'] });
      avisarSucesso(centro ? 'Alterações salvas' : 'Centro de custo cadastrado');
      aoFechar();
    },
    onError: avisarErro,
  });

  return (
    <form onSubmit={form.onSubmit((v) => salvar.mutate(v))}>
      <Stack>
        <TextInput label="Nome" data-autofocus {...form.getInputProps('nome')} />
        <TextInput label="Descrição" description="Opcional" {...form.getInputProps('descricao')} />
        <Switch label="Ativo" description="Inativos não aparecem em novos lançamentos" {...form.getInputProps('ativo', { type: 'checkbox' })} />
        <Group justify="flex-end">
          <Button variant="default" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" loading={salvar.isPending}>
            Salvar
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

const ORIGENS: Record<OrigemLancamento, string> = {
  CONTA_RECEBER: 'Conta a receber',
  CONTA_PAGAR: 'Conta a pagar',
  CARTAO: 'Cartão de crédito',
  FATURA: 'Fatura do cartão',
  AVULSA: 'Lançamento avulso',
};

function Indicador({ rotulo, valor, cor, detalhe }: { rotulo: string; valor: string; cor?: string; detalhe?: string }) {
  return (
    <Paper withBorder p="sm" radius="md">
      <Text size="xs" c="dimmed" fw={500}>
        {rotulo}
      </Text>
      <Text fw={700} size="lg" c={cor} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {valor}
      </Text>
      {detalhe && (
        <Text size="xs" c="dimmed">
          {detalhe}
        </Text>
      )}
    </Paper>
  );
}

/** Resultado de um centro de custo (serviço, projeto, loja) no período: indicadores, categorias e lançamentos. */
function ResumoCentro({ centro }: { centro: CentroCusto }) {
  // Serviços costumam durar meses: o padrão é o ano inteiro.
  const inicial = ATALHOS[2].periodo();
  const [de, setDe] = useState<string | null>(inicial.de);
  const [ate, setAte] = useState<string | null>(inicial.ate);
  const [regime, setRegime] = useState<RegimeDre>('competencia');
  const periodoValido = !!de && !!ate && de <= ate;
  const resumo = useQuery({
    queryKey: ['resumo-centro-custo', centro.id, de, ate, regime],
    queryFn: () => api.get<ResumoCentroCusto>(`/financeiro/centros-custo/${centro.id}/resumo${consulta({ de, ate, regime })}`),
    enabled: periodoValido,
  });
  const r = resumo.data;

  return (
    <Stack>
      {centro.descricao && (
        <Text size="sm" c="dimmed">
          {centro.descricao}
        </Text>
      )}
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
        />
      </Card>
      {!periodoValido ? (
        <Text c="red" size="sm">
          Informe o período, com a data final igual ou posterior à inicial.
        </Text>
      ) : resumo.isPending ? (
        <Loader />
      ) : resumo.isError ? (
        <ErroCarregamento erro={resumo.error} />
      ) : (
        r && (
          <>
            <SimpleGrid cols={{ base: 2, sm: 4 }}>
              <Indicador rotulo="Receitas" valor={moeda(r.receitas)} cor="teal.8" />
              <Indicador rotulo="Despesas" valor={moeda(r.despesas)} cor="red.7" />
              <Indicador rotulo={r.resultado >= 0 ? 'Lucro' : 'Prejuízo'} valor={moeda(r.resultado)} cor={r.resultado < 0 ? 'red.7' : 'teal.8'} />
              <Indicador
                rotulo="Margem"
                valor={r.margem === null ? '—' : `${r.margem.toFixed(1).replace('.', ',')}%`}
                detalhe={r.margem === null ? 'Sem receita no período' : 'Lucro sobre a receita'}
              />
            </SimpleGrid>
            {(r.emAberto.receber > 0 || r.emAberto.pagar > 0) && (
              <Group gap="lg">
                <Text size="sm">
                  <Text span c="dimmed">
                    A receber em aberto:{' '}
                  </Text>
                  <Text span fw={600}>
                    {moeda(r.emAberto.receber)}
                  </Text>
                </Text>
                <Text size="sm">
                  <Text span c="dimmed">
                    A pagar em aberto:{' '}
                  </Text>
                  <Text span fw={600}>
                    {moeda(r.emAberto.pagar)}
                  </Text>
                </Text>
                <Text size="xs" c="dimmed">
                  (contas deste centro ainda não quitadas, de qualquer vencimento)
                </Text>
              </Group>
            )}
            <Tabs defaultValue="categorias" keepMounted={false}>
              <Tabs.List>
                <Tabs.Tab value="categorias">Por categoria</Tabs.Tab>
                <Tabs.Tab value="lancamentos">Lançamentos ({r.totalLancamentos})</Tabs.Tab>
              </Tabs.List>
              <Tabs.Panel value="categorias" pt="sm">
                <Stack gap="xs">
                  <TabelaResultado resultado={r} />
                  <AvisoSemCategoria resultado={r} />
                </Stack>
              </Tabs.Panel>
              <Tabs.Panel value="lancamentos" pt="sm">
                {r.lancamentos.length === 0 ? (
                  <Text c="dimmed" size="sm">
                    Nenhum lançamento deste centro de custo no período.
                  </Text>
                ) : (
                  <Table.ScrollContainer minWidth={560}>
                    <Table verticalSpacing="xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th w={100}>Data</Table.Th>
                          <Table.Th>Descrição</Table.Th>
                          <Table.Th>Categoria</Table.Th>
                          <Table.Th ta="right" w={130}>
                            Valor
                          </Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {r.lancamentos.map((l, i) => (
                          <Table.Tr key={`${l.origem}-${l.referencia}-${l.data}-${i}`}>
                            <Table.Td>{data(l.data)}</Table.Td>
                            <Table.Td>
                              <Text size="sm">{l.descricao}</Text>
                              <Group gap={6} mt={2}>
                                <Badge size="xs" variant="light" color="gray">
                                  {ORIGENS[l.origem]}
                                </Badge>
                                {l.pessoa && (
                                  <Text size="xs" c="dimmed">
                                    {l.pessoa}
                                  </Text>
                                )}
                              </Group>
                            </Table.Td>
                            <Table.Td>
                              {l.categoria ? (
                                <Text size="sm">
                                  <Text span ff="monospace" c="dimmed" size="xs" mr={6}>
                                    {l.categoria.codigo}
                                  </Text>
                                  {l.categoria.nome}
                                </Text>
                              ) : (
                                <Text size="sm" c="orange.8">
                                  Sem categoria
                                </Text>
                              )}
                            </Table.Td>
                            <Table.Td ta="right" c={l.tipo === 'RECEITA' ? 'teal.8' : 'red.7'} fw={500}>
                              {l.tipo === 'RECEITA' ? '+' : '−'} {moeda(Math.abs(l.valor))}
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                )}
                {r.totalLancamentos > r.lancamentos.length && (
                  <Text size="xs" c="dimmed" mt="xs">
                    Mostrando os {r.lancamentos.length} mais recentes de {r.totalLancamentos}; os totais consideram todos. Reduza o período para ver
                    os demais.
                  </Text>
                )}
              </Tabs.Panel>
            </Tabs>
          </>
        )
      )}
    </Stack>
  );
}

export function CentrosCusto() {
  const { pode } = useSessao();
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<CentroCusto | 'novo' | null>(null);
  const [removendo, setRemovendo] = useState<CentroCusto | null>(null);
  const [vendo, setVendo] = useState<CentroCusto | null>(null);
  const celular = useMediaQuery('(max-width: 48em)');
  const lista = useQuery({ queryKey: ['/centros-custo'], queryFn: () => api.get<CentroCusto[]>('/centros-custo') });

  const remover = useMutation({
    mutationFn: (c: CentroCusto) => api.delete(`/centros-custo/${c.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/centros-custo'] });
      avisarSucesso('Centro de custo removido');
    },
    onError: avisarErro,
    onSettled: () => setRemovendo(null),
  });

  const escrever = pode('escreverCadastros');
  // O resumo mostra valores financeiros: só para quem vê saldos.
  const verResumo = pode('verSaldos');
  return (
    <>
      <Cabecalho
        titulo="Centros de custo"
        descricao={
          verResumo
            ? 'Serviços, projetos ou lojas para separar receitas e despesas. Clique em um para ver o resultado dele.'
            : 'Serviços, projetos ou lojas para separar receitas e despesas'
        }
        acoes={
          escrever && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setEditando('novo')}>
              Novo centro de custo
            </Button>
          )
        }
      />
      <Card withBorder padding={0}>
        {lista.isPending ? (
          <Loader m="md" />
        ) : lista.isError ? (
          <ErroCarregamento erro={lista.error} />
        ) : lista.data.length === 0 ? (
          <Text c="dimmed" p="md">
            Nenhum centro de custo cadastrado. Eles são opcionais nos lançamentos.
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={480}>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Nome</Table.Th>
                  <Table.Th>Descrição</Table.Th>
                  <Table.Th w={110}>Situação</Table.Th>
                  {escrever && <Table.Th w={48} />}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {lista.data.map((c) => (
                  <Table.Tr key={c.id} style={verResumo ? { cursor: 'pointer' } : undefined} onClick={verResumo ? () => setVendo(c) : undefined}>
                    <Table.Td fw={500}>{c.nome}</Table.Td>
                    <Table.Td c="dimmed">{c.descricao}</Table.Td>
                    <Table.Td>
                      <SituacaoAtivo ativo={c.ativo} />
                    </Table.Td>
                    {escrever && (
                      <Table.Td onClick={(e) => e.stopPropagation()}>
                        <MenuAcoes
                          rotulo={c.nome}
                          itens={[
                            verResumo && { texto: 'Ver resultado', aoClicar: () => setVendo(c) },
                            { texto: 'Editar', aoClicar: () => setEditando(c) },
                            pode('remover') && { texto: 'Remover', aoClicar: () => setRemovendo(c), perigosa: true },
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
      <Modal opened={editando !== null} onClose={() => setEditando(null)} title={editando === 'novo' ? 'Novo centro de custo' : 'Editar centro de custo'}>
        {editando !== null && <FormCentro centro={editando === 'novo' ? null : editando} aoFechar={() => setEditando(null)} />}
      </Modal>
      <Modal opened={vendo !== null} onClose={() => setVendo(null)} title={vendo && `Resultado de ${vendo.nome}`} size="xl" fullScreen={celular}>
        {vendo && <ResumoCentro centro={vendo} />}
      </Modal>
      <Confirmacao
        aberta={removendo !== null}
        titulo="Remover centro de custo"
        mensagem={`Remover ${removendo?.nome}? Se houver lançamentos ligados a ele, a remoção é recusada; nesse caso, desative.`}
        rotuloConfirmar="Remover"
        perigosa
        carregando={remover.isPending}
        aoConfirmar={() => removendo && remover.mutate(removendo)}
        aoFechar={() => setRemovendo(null)}
      />
    </>
  );
}

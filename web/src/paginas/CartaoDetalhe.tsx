import { ActionIcon, Alert, Anchor, Badge, Button, Card, Checkbox, Group, Loader, Modal, NumberInput, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconChevronLeft, IconChevronRight, IconInfoCircle, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/cliente';
import type { CartaoCredito, CentroCusto, ContaFinanceira, FaturaCartao, LancamentoCartao, Pessoa, PlanoConta } from '../api/tipos';
import { avisarErro, avisarSucesso, CampoData, CampoMoeda, Confirmacao, ErroCarregamento, MenuAcoes, SemPermissao } from '../componentes/comum';
import { useSessao } from '../sessao/sessao';
import { data, hoje, mesAno, moeda, STATUS_CONTA } from '../util/formato';
import { FormBaixa, PAGAR } from './Contas';

const somarMes = (competencia: string, n: number) => dayjs(`${competencia}-01`).add(n, 'month').format('YYYY-MM');
const diaAnterior = (iso: string) => dayjs(iso).subtract(1, 'day').format('YYYY-MM-DD');

/** Tudo que muda quando um lançamento, data ou situação da fatura muda. */
function useInvalidar() {
  const queryClient = useQueryClient();
  return () => {
    for (const chave of ['fatura-cartao', 'cartao', 'cartoes', '/contas-pagar', 'fluxo-caixa', 'saldos', 'dre', 'extrato']) {
      queryClient.invalidateQueries({ queryKey: [chave] });
    }
  };
}

/** Categorias de despesa, centros de custo e fornecedores para os formulários de lançamento. */
function useApoio() {
  const plano = useQuery({ queryKey: ['/plano-contas'], queryFn: () => api.get<PlanoConta[]>('/plano-contas') });
  const centros = useQuery({ queryKey: ['/centros-custo'], queryFn: () => api.get<CentroCusto[]>('/centros-custo') });
  const fornecedores = useQuery({ queryKey: ['/fornecedores'], queryFn: () => api.get<Pessoa[]>('/fornecedores') });
  return {
    categorias: (plano.data ?? []).filter((c) => c.tipo === 'DESPESA' && c.aceitaLancamento && c.ativo).map((c) => ({ value: c.id, label: `${c.codigo} ${c.nome}` })),
    centros: (centros.data ?? []).filter((c) => c.ativo).map((c) => ({ value: c.id, label: c.nome })),
    fornecedores: (fornecedores.data ?? []).filter((f) => f.ativo).map((f) => ({ value: f.id, label: f.nome })),
  };
}

function FormLancamento({ cartao, aoFechar, aoLancar }: { cartao: CartaoCredito; aoFechar: () => void; aoLancar: (competencia: string) => void }) {
  const invalidar = useInvalidar();
  const apoio = useApoio();
  const form = useForm({
    initialValues: {
      data: hoje() as string | null,
      descricao: '',
      valor: '' as number | '',
      parcelas: 1,
      estorno: false,
      planoContaId: null as string | null,
      centroCustoId: null as string | null,
      fornecedorId: null as string | null,
    },
    validate: {
      data: (v) => (v ? null : 'Informe a data da compra'),
      descricao: (v) => (v.trim() ? null : 'Descreva, como "Combustível" ou "Assinatura do software"'),
      valor: (v) => (Number(v) > 0 ? null : 'Informe o valor'),
      parcelas: (v, c) => (c.estorno && v > 1 ? 'Estorno não é parcelado' : v >= 1 && v <= 48 ? null : 'De 1 a 48'),
    },
  });
  const lancar = useMutation({
    mutationFn: (v: typeof form.values) =>
      api.post<LancamentoCartao[]>(`/cartoes/${cartao.id}/lancamentos`, {
        data: v.data,
        descricao: v.descricao.trim(),
        valor: Number(v.valor),
        tipo: v.estorno ? 'ESTORNO' : 'COMPRA',
        parcelas: v.parcelas,
        planoContaId: v.planoContaId ?? undefined,
        centroCustoId: v.centroCustoId ?? undefined,
        fornecedorId: v.fornecedorId ?? undefined,
      }),
    onSuccess: (lancados) => {
      invalidar();
      const competencia = lancados[0].fatura!.competencia;
      avisarSucesso(
        lancados.length > 1
          ? `${lancados.length} parcelas lançadas, a partir da fatura de ${mesAno(competencia)}`
          : `Lançado na fatura de ${mesAno(competencia)}`,
      );
      aoLancar(competencia);
      aoFechar();
    },
    onError: avisarErro,
  });

  return (
    <form onSubmit={form.onSubmit((v) => lancar.mutate(v))}>
      <Stack>
        <TextInput label="Descrição" data-autofocus {...form.getInputProps('descricao')} />
        <SimpleGrid cols={{ base: 1, xs: 3 }}>
          <CampoData label="Data da compra" {...form.getInputProps('data')} />
          <CampoMoeda label={form.values.parcelas > 1 ? 'Valor total' : 'Valor'} {...form.getInputProps('valor')} />
          <NumberInput label="Parcelas" min={1} max={48} allowDecimal={false} disabled={form.values.estorno} {...form.getInputProps('parcelas')} />
        </SimpleGrid>
        {form.values.parcelas > 1 && Number(form.values.valor) > 0 && (
          <Text size="xs" c="dimmed">
            {form.values.parcelas} parcelas de cerca de {moeda(Number(form.values.valor) / form.values.parcelas)}, uma em cada fatura.
          </Text>
        )}
        <Checkbox
          label="Estorno ou crédito na fatura (devolução, cancelamento, cashback)"
          {...form.getInputProps('estorno', { type: 'checkbox' })}
        />
        <Select label="Categoria" description="Aparece na DRE na data da compra" data={apoio.categorias} searchable clearable {...form.getInputProps('planoContaId')} />
        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <Select label="Centro de custo" placeholder="Opcional" data={apoio.centros} searchable clearable {...form.getInputProps('centroCustoId')} />
          <Select label="Estabelecimento" placeholder="Opcional (fornecedor)" data={apoio.fornecedores} searchable clearable {...form.getInputProps('fornecedorId')} />
        </SimpleGrid>
        <Group justify="flex-end">
          <Button variant="default" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" loading={lancar.isPending}>
            Lançar
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

function FormClassificacao({ cartao, lancamento, aoFechar }: { cartao: CartaoCredito; lancamento: LancamentoCartao; aoFechar: () => void }) {
  const invalidar = useInvalidar();
  const apoio = useApoio();
  const form = useForm({
    initialValues: {
      descricao: lancamento.descricao,
      planoContaId: lancamento.planoContaId,
      centroCustoId: lancamento.centroCustoId,
      fornecedorId: lancamento.fornecedorId,
    },
    validate: { descricao: (v) => (v.trim() ? null : 'Informe a descrição') },
  });
  const salvar = useMutation({
    mutationFn: (v: typeof form.values) => api.patch(`/cartoes/${cartao.id}/lancamentos/${lancamento.id}`, { ...v, descricao: v.descricao.trim() }),
    onSuccess: () => {
      invalidar();
      avisarSucesso('Lançamento atualizado');
      aoFechar();
    },
    onError: avisarErro,
  });
  return (
    <form onSubmit={form.onSubmit((v) => salvar.mutate(v))}>
      <Stack>
        {lancamento.totalParcelas && (
          <Text size="sm" c="dimmed">
            Vale para as {lancamento.totalParcelas} parcelas da compra. Para mudar valor, data ou parcelas, exclua e lance de novo.
          </Text>
        )}
        <TextInput label="Descrição" {...form.getInputProps('descricao')} />
        <Select label="Categoria" data={apoio.categorias} searchable clearable {...form.getInputProps('planoContaId')} />
        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <Select label="Centro de custo" data={apoio.centros} searchable clearable {...form.getInputProps('centroCustoId')} />
          <Select label="Estabelecimento" data={apoio.fornecedores} searchable clearable {...form.getInputProps('fornecedorId')} />
        </SimpleGrid>
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

function FormDatas({ cartao, fatura, aoFechar }: { cartao: CartaoCredito; fatura: FaturaCartao; aoFechar: () => void }) {
  const invalidar = useInvalidar();
  const form = useForm({
    initialValues: { dataFechamento: fatura.dataFechamento as string | null, dataVencimento: fatura.dataVencimento as string | null },
    validate: {
      dataFechamento: (v) => (v ? null : 'Informe a data'),
      dataVencimento: (v, c) => (!v ? 'Informe a data' : c.dataFechamento && v < c.dataFechamento ? 'Não pode ser antes do fechamento' : null),
    },
  });
  const salvar = useMutation({
    mutationFn: (v: typeof form.values) => api.patch<FaturaCartao>(`/cartoes/${cartao.id}/faturas/${fatura.competencia}`, v),
    onSuccess: () => {
      invalidar();
      avisarSucesso('Datas ajustadas; as compras foram redistribuídas pelo novo fechamento');
      aoFechar();
    },
    onError: avisarErro,
  });
  return (
    <form onSubmit={form.onSubmit((v) => salvar.mutate(v))}>
      <Stack>
        <Text size="sm">
          Use as datas que estão na fatura do banco. Compras até a véspera do fechamento ficam nesta fatura; as do dia do fechamento em diante
          vão para a próxima.
        </Text>
        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <CampoData label="Fechamento" {...form.getInputProps('dataFechamento')} />
          <CampoData label="Vencimento" {...form.getInputProps('dataVencimento')} />
        </SimpleGrid>
        <Text size="xs" c="dimmed">
          Padrão do cartão: fecha dia {cartao.diaFechamento}, vence dia {cartao.diaVencimento}.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" loading={salvar.isPending}>
            Ajustar datas
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

function Fatura({ cartao, competencia, aoMudarCompetencia }: { cartao: CartaoCredito; competencia: string; aoMudarCompetencia: (c: string) => void }) {
  const { pode } = useSessao();
  const invalidar = useInvalidar();
  const [ajustando, setAjustando] = useState(false);
  const [confirmando, setConfirmando] = useState<'fechar' | 'reabrir' | null>(null);
  const [pagando, setPagando] = useState<ContaFinanceira | null>(null);
  const [classificando, setClassificando] = useState<LancamentoCartao | null>(null);
  const [excluindo, setExcluindo] = useState<LancamentoCartao | null>(null);
  const fatura = useQuery({
    queryKey: ['fatura-cartao', cartao.id, competencia],
    queryFn: () => api.get<FaturaCartao>(`/cartoes/${cartao.id}/faturas/${competencia}`),
  });
  const situacao = useMutation({
    mutationFn: (acao: 'fechar' | 'reabrir') =>
      api.post(`/cartoes/${cartao.id}/faturas/${competencia}/${acao === 'fechar' ? 'fechamento' : 'reabertura'}`),
    onSuccess: (_, acao) => {
      invalidar();
      avisarSucesso(acao === 'fechar' ? 'Fatura fechada' : 'Fatura reaberta');
    },
    onError: avisarErro,
    onSettled: () => setConfirmando(null),
  });
  const excluir = useMutation({
    mutationFn: (l: LancamentoCartao) => api.delete(`/cartoes/${cartao.id}/lancamentos/${l.id}`),
    onSuccess: () => {
      invalidar();
      avisarSucesso('Compra excluída');
    },
    onError: avisarErro,
    onSettled: () => setExcluindo(null),
  });
  const abrirPagamento = async () => {
    try {
      setPagando(await api.get<ContaFinanceira>(`/contas-pagar/${fatura.data!.contaPagar!.id}`));
    } catch (erro) {
      avisarErro(erro);
    }
  };

  const escrever = pode('escreverFinanceiro');
  const f = fatura.data;
  const aberta = f?.status === 'ABERTA';
  const statusConta = f?.contaPagar && STATUS_CONTA[f.contaPagar.status];
  return (
    <Card withBorder padding={0}>
      <Group justify="space-between" p="md" wrap="wrap">
        <Group gap="xs">
          <ActionIcon variant="default" aria-label="Fatura anterior" onClick={() => aoMudarCompetencia(somarMes(competencia, -1))}>
            <IconChevronLeft size={18} />
          </ActionIcon>
          <Title order={4} miw={170} ta="center" style={{ whiteSpace: 'nowrap' }}>
            Fatura {mesAno(competencia)}
          </Title>
          <ActionIcon variant="default" aria-label="Próxima fatura" onClick={() => aoMudarCompetencia(somarMes(competencia, 1))}>
            <IconChevronRight size={18} />
          </ActionIcon>
          {competencia !== cartao.faturaAtual && (
            <Anchor size="sm" onClick={() => aoMudarCompetencia(cartao.faturaAtual)}>
              Ir para a atual
            </Anchor>
          )}
        </Group>
        {f && (
          <Group gap="xs">
            <Badge variant="light" color={aberta ? 'blue' : 'gray'}>
              {aberta ? 'Aberta' : 'Fechada'}
            </Badge>
            {statusConta && (
              <Badge variant="light" color={statusConta.cor}>
                {f.contaPagar!.status === 'ABERTA' ? 'A pagar' : statusConta.rotulo}
              </Badge>
            )}
          </Group>
        )}
      </Group>
      {fatura.isPending ? (
        <Loader m="md" />
      ) : fatura.isError ? (
        <ErroCarregamento erro={fatura.error} />
      ) : (
        <>
          <SimpleGrid cols={{ base: 2, sm: 4 }} px="md" pb="md">
            <div>
              <Text size="xs" c="dimmed">
                Compras de
              </Text>
              <Text size="sm">
                {data(f!.inicioPeriodo)} a {data(diaAnterior(f!.dataFechamento))}
              </Text>
            </div>
            <div>
              <Text size="xs" c="dimmed">
                Fechamento
              </Text>
              <Group gap={6}>
                <Text size="sm">{data(f!.dataFechamento)}</Text>
                {f!.datasAjustadas && (
                  <Badge size="xs" variant="outline">
                    ajustada
                  </Badge>
                )}
              </Group>
            </div>
            <div>
              <Text size="xs" c="dimmed">
                Vencimento
              </Text>
              <Text size="sm">{data(f!.dataVencimento)}</Text>
            </div>
            <div>
              <Text size="xs" c="dimmed">
                Total
              </Text>
              <Text fw={700} size="lg" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {moeda(f!.total)}
              </Text>
              {f!.pago > 0 && (
                <Text size="xs" c="teal.8">
                  pago {moeda(f!.pago)}
                </Text>
              )}
            </div>
          </SimpleGrid>
          {escrever && (
            <Group px="md" pb="md" gap="xs">
              {aberta && (
                <Button size="xs" variant="default" onClick={() => setAjustando(true)}>
                  Ajustar datas
                </Button>
              )}
              {aberta && (
                <Button size="xs" variant="light" onClick={() => setConfirmando('fechar')}>
                  Fechar fatura
                </Button>
              )}
              {!aberta && f!.pago === 0 && (
                <Button size="xs" variant="default" onClick={() => setConfirmando('reabrir')}>
                  Reabrir
                </Button>
              )}
              {!aberta && f!.contaPagar && f!.contaPagar.status !== 'PAGA' && (
                <Button size="xs" onClick={abrirPagamento}>
                  Pagar fatura
                </Button>
              )}
            </Group>
          )}
          {aberta && f!.total > 0 && (
            <Alert color="blue" variant="light" icon={<IconInfoCircle size={16} />} mx="md" mb="md" p="xs">
              <Text size="xs">
                Já está em contas a pagar com vencimento em {data(f!.dataVencimento)}; o valor acompanha os lançamentos. Confira o total com o
                banco e feche a fatura antes de pagar.
              </Text>
            </Alert>
          )}
          {f!.lancamentos.length === 0 ? (
            <Text c="dimmed" p="md" size="sm">
              Nenhum lançamento nesta fatura.
            </Text>
          ) : (
            <Table.ScrollContainer minWidth={680}>
              <Table highlightOnHover verticalSpacing="xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={100}>Data</Table.Th>
                    <Table.Th>Descrição</Table.Th>
                    <Table.Th>Categoria</Table.Th>
                    <Table.Th ta="right">Valor</Table.Th>
                    {escrever && <Table.Th w={48} />}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {f!.lancamentos.map((l) => (
                    <Table.Tr key={l.id}>
                      <Table.Td>{data(l.data)}</Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          {l.descricao}
                          {l.totalParcelas && (
                            <Text span c="dimmed" size="xs" ml={6}>
                              {l.parcela}/{l.totalParcelas}
                            </Text>
                          )}
                        </Text>
                        {(l.fornecedor || l.centroCusto) && (
                          <Text size="xs" c="dimmed">
                            {[l.fornecedor?.nome, l.centroCusto?.nome].filter(Boolean).join(' · ')}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {l.planoConta ? (
                          <Text size="sm">{l.planoConta.nome}</Text>
                        ) : (
                          <Text size="sm" c="orange.8">
                            Sem categoria
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td ta="right" c={l.tipo === 'ESTORNO' ? 'teal.8' : undefined}>
                        {l.tipo === 'ESTORNO' ? `− ${moeda(l.valor)}` : moeda(l.valor)}
                      </Table.Td>
                      {escrever && (
                        <Table.Td>
                          <MenuAcoes
                            rotulo={l.descricao}
                            itens={[
                              { texto: 'Editar descrição e categoria', aoClicar: () => setClassificando(l) },
                              aberta && {
                                texto: l.totalParcelas ? 'Excluir compra (todas as parcelas)' : 'Excluir',
                                aoClicar: () => setExcluindo(l),
                                perigosa: true,
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
        </>
      )}
      <Modal opened={ajustando} onClose={() => setAjustando(false)} title={`Datas da fatura de ${mesAno(competencia)}`}>
        {ajustando && f && <FormDatas cartao={cartao} fatura={f} aoFechar={() => setAjustando(false)} />}
      </Modal>
      <Modal opened={classificando !== null} onClose={() => setClassificando(null)} title="Editar lançamento" size="lg">
        {classificando && <FormClassificacao cartao={cartao} lancamento={classificando} aoFechar={() => setClassificando(null)} />}
      </Modal>
      <Modal opened={pagando !== null} onClose={() => setPagando(null)} title={`Pagar fatura de ${mesAno(competencia)}`} size="lg">
        {pagando && <FormBaixa config={PAGAR} conta={pagando} contaBancariaPadrao={cartao.contaBancariaId} aoFechar={() => { setPagando(null); invalidar(); }} />}
      </Modal>
      <Confirmacao
        aberta={confirmando !== null}
        titulo={confirmando === 'fechar' ? `Fechar a fatura de ${mesAno(competencia)}` : 'Reabrir a fatura'}
        mensagem={
          confirmando === 'fechar'
            ? `O total de ${moeda(f?.total ?? 0)} confere com a fatura do banco? Depois de fechada, a fatura não recebe nem perde lançamentos e as datas não mudam.`
            : 'A fatura volta a aceitar lançamentos e ajustes de data.'
        }
        rotuloConfirmar={confirmando === 'fechar' ? 'Fechar fatura' : 'Reabrir'}
        carregando={situacao.isPending}
        aoConfirmar={() => confirmando && situacao.mutate(confirmando)}
        aoFechar={() => setConfirmando(null)}
      />
      <Confirmacao
        aberta={excluindo !== null}
        titulo="Excluir compra"
        mensagem={
          excluindo?.totalParcelas
            ? `Excluir "${excluindo.descricao}" e as ${excluindo.totalParcelas} parcelas dela?`
            : `Excluir "${excluindo?.descricao}" de ${moeda(excluindo?.valor ?? 0)}?`
        }
        rotuloConfirmar="Excluir"
        perigosa
        carregando={excluir.isPending}
        aoConfirmar={() => excluindo && excluir.mutate(excluindo)}
        aoFechar={() => setExcluindo(null)}
      />
    </Card>
  );
}

export function CartaoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { pode } = useSessao();
  const [parametros, setParametros] = useSearchParams();
  const [lancando, setLancando] = useState(false);
  const cartao = useQuery({ queryKey: ['cartao', id], queryFn: () => api.get<CartaoCredito>(`/cartoes/${id}`), enabled: pode('verSaldos') });

  if (!pode('verSaldos')) return <SemPermissao titulo="Cartão de crédito" />;
  if (cartao.isPending) return <Loader />;
  if (cartao.isError) return <ErroCarregamento erro={cartao.error} />;
  const c = cartao.data;
  const competencia = parametros.get('fatura') ?? c.faturaAtual;
  const irPara = (comp: string) => setParametros({ fatura: comp }, { replace: true });

  return (
    <>
      <Group justify="space-between" align="flex-end" mb="lg" wrap="wrap">
        <div>
          <Anchor component={Link} to="/cartoes" size="sm">
            ← Cartões de crédito
          </Anchor>
          <Title order={2}>
            {c.nome}
            {c.final && (
              <Text span c="dimmed" fz="lg" ml="xs">
                •••• {c.final}
              </Text>
            )}
          </Title>
          <Text size="sm" c="dimmed">
            Fecha dia {c.diaFechamento}, vence dia {c.diaVencimento} · paga por {c.contaBancaria.nome}
            {c.limite !== null && ` · disponível ${moeda(c.limiteDisponivel ?? 0)} de ${moeda(c.limite)}`}
          </Text>
        </div>
        {pode('escreverFinanceiro') && c.ativo && (
          <Button leftSection={<IconPlus size={16} />} onClick={() => setLancando(true)}>
            Novo lançamento
          </Button>
        )}
      </Group>
      <Stack>
        <Fatura cartao={c} competencia={competencia} aoMudarCompetencia={irPara} />
      </Stack>
      <Modal opened={lancando} onClose={() => setLancando(false)} title={`Lançar no ${c.nome}`} size="lg">
        {lancando && <FormLancamento cartao={c} aoFechar={() => setLancando(false)} aoLancar={irPara} />}
      </Modal>
    </>
  );
}

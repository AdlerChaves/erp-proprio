import { Alert, Badge, Button, Card, Divider, Drawer, Group, List, Loader, Modal, Select, Stack, Table, Tabs, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { api, consulta } from '../api/cliente';
import type { Pessoa, PosicaoEstoque, StatusVenda, Venda } from '../api/tipos';
import { avisarErro, avisarSucesso, Cabecalho, CampoData, Confirmacao, ErroCarregamento, MenuAcoes } from '../componentes/comum';
import { type ConfigDocumento, ContasGeradas, FormDocumento, TabelaItens } from '../componentes/Documento';
import { useSessao } from '../sessao/sessao';
import { data, hoje, moeda, qtd } from '../util/formato';

export const CONFIG_VENDA: ConfigDocumento = {
  rota: '/vendas',
  nome: 'venda',
  pessoa: { campo: 'clienteId', rota: '/clientes', rotulo: 'Cliente' },
  tipoCategoria: 'RECEITA',
  preco: { campo: 'precoUnitario', rotulo: 'Preço', padrao: (p) => p.precoVenda },
  comDesconto: true,
  soProdutos: false,
  momentoContas: 'no faturamento',
};

export const STATUS_VENDA: Record<StatusVenda, { rotulo: string; cor: string }> = {
  ORCAMENTO: { rotulo: 'Orçamento', cor: 'gray' },
  PEDIDO: { rotulo: 'Pedido', cor: 'blue' },
  FATURADA: { rotulo: 'Faturada', cor: 'teal' },
  CANCELADA: { rotulo: 'Cancelada', cor: 'red' },
};

/** Faturamento e cancelamento mudam estoque, contas e o painel. */
function useInvalidar() {
  const queryClient = useQueryClient();
  return () => {
    for (const chave of ['/vendas', 'venda', 'estoque', '/contas-receber', 'saldos', 'fluxo-caixa', 'dre']) {
      queryClient.invalidateQueries({ queryKey: [chave] });
    }
  };
}

/** Avisos de estoque negativo devolvidos pela API depois de faturar ou cancelar. */
const mostrarAvisos = (avisos?: string[]) =>
  avisos?.length &&
  notifications.show({ color: 'yellow', title: 'Atenção ao estoque', message: avisos.join(' · '), autoClose: 10000 });

function FormFaturar({ venda, aoFechar }: { venda: Venda; aoFechar: () => void }) {
  const invalidar = useInvalidar();
  const [dataFaturamento, setData] = useState<string | null>(hoje());
  const estoque = useQuery({ queryKey: ['estoque'], queryFn: () => api.get<PosicaoEstoque>('/estoque') });

  // O pedido já está reservado; o que importa é se o saldo físico cobre a saída.
  const faltas = (venda.itens ?? [])
    .filter((i) => i.produto?.tipo === 'PRODUTO')
    .map((i) => ({ item: i, saldo: estoque.data?.itens.find((p) => p.produto.id === i.produtoId)?.estoque ?? 0 }))
    .filter(({ item, saldo }) => estoque.data && saldo < item.quantidade);

  const faturar = useMutation({
    mutationFn: () => api.post<Venda>(`/vendas/${venda.id}/faturamento`, { data: dataFaturamento }),
    onSuccess: (faturada) => {
      invalidar();
      avisarSucesso(`Venda nº ${venda.numero} faturada; ${faturada.contas?.length ?? 0} conta(s) a receber lançada(s)`);
      mostrarAvisos(faturada.avisos);
      aoFechar();
    },
    onError: avisarErro,
  });
  const vencimento = venda.primeiroVencimento ?? dataFaturamento;

  return (
    <Stack>
      <Text size="sm">
        Ao faturar, os produtos saem do estoque e {venda.parcelas > 1 ? `${venda.parcelas} parcelas mensais` : 'uma conta'} de{' '}
        <b>{moeda(venda.total)}</b> {venda.parcelas > 1 ? 'são lançadas' : 'é lançada'} em contas a receber
        {vencimento && `, a partir de ${data(vencimento)}`}.
      </Text>
      <CampoData label="Data do faturamento" value={dataFaturamento} onChange={setData} />
      {faltas.length > 0 && (
        <Alert color="yellow" icon={<IconAlertTriangle size={18} />} title="Estoque insuficiente">
          <List size="sm">
            {faltas.map(({ item, saldo }) => (
              <List.Item key={item.id}>
                {item.descricao}: {qtd(saldo)} em estoque, a venda leva {qtd(item.quantidade)}
              </List.Item>
            ))}
          </List>
          <Text size="sm" mt="xs">
            O faturamento é permitido, mas o estoque ficará negativo até a entrada da mercadoria.
          </Text>
        </Alert>
      )}
      <Group justify="flex-end">
        <Button variant="default" onClick={aoFechar}>
          Voltar
        </Button>
        <Button loading={faturar.isPending} disabled={!dataFaturamento} onClick={() => faturar.mutate()}>
          Faturar
        </Button>
      </Group>
    </Stack>
  );
}

function Detalhe({ id, aoEditar, aoFaturar }: { id: string; aoEditar: (v: Venda) => void; aoFaturar: (v: Venda) => void }) {
  const { pode } = useSessao();
  const invalidar = useInvalidar();
  const [cancelando, setCancelando] = useState(false);
  const venda = useQuery({ queryKey: ['venda', id], queryFn: () => api.get<Venda>(`/vendas/${id}`) });

  const aprovar = useMutation({
    mutationFn: () => api.post(`/vendas/${id}/aprovacao`),
    onSuccess: () => {
      invalidar();
      avisarSucesso('Orçamento aprovado: agora é um pedido e reserva o estoque');
    },
    onError: avisarErro,
  });
  const cancelar = useMutation({
    mutationFn: () => api.post<Venda>(`/vendas/${id}/cancelamento`),
    onSuccess: (cancelada) => {
      invalidar();
      avisarSucesso('Venda cancelada');
      mostrarAvisos(cancelada.avisos);
    },
    onError: avisarErro,
    onSettled: () => setCancelando(false),
  });

  if (venda.isPending) return <Loader />;
  if (venda.isError) return <ErroCarregamento erro={venda.error} />;
  const v = venda.data;
  const status = STATUS_VENDA[v.status];
  const vender = pode('vender');
  const podeCancelar = vender && v.status !== 'CANCELADA' && (v.status !== 'FATURADA' || pode('escreverFinanceiro'));
  const linha = (rotulo: string, valor: ReactNode) => (
    <Group justify="space-between" wrap="nowrap" gap="xl">
      <Text size="sm" c="dimmed">
        {rotulo}
      </Text>
      <Text size="sm" ta="right">
        {valor}
      </Text>
    </Group>
  );

  return (
    <Stack>
      <Group justify="space-between">
        <Text fw={700} size="lg">
          Venda nº {v.numero}
        </Text>
        <Badge color={status.cor} variant="light" size="lg">
          {status.rotulo}
        </Badge>
      </Group>
      {linha('Cliente', v.cliente.nome)}
      {linha('Emissão', data(v.dataEmissao))}
      {v.dataFaturamento && linha('Faturada em', data(v.dataFaturamento))}
      {linha('Pagamento', `${v.parcelas === 1 ? 'Parcela única' : `${v.parcelas}x mensais`}${v.primeiroVencimento ? `, a partir de ${data(v.primeiroVencimento)}` : ', à vista no faturamento'}`)}
      {linha('Categoria', v.planoConta ? `${v.planoConta.codigo} ${v.planoConta.nome}` : '—')}
      {v.centroCusto && linha('Centro de custo', v.centroCusto.nome)}
      {v.observacoes && (
        <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
          {v.observacoes}
        </Text>
      )}
      <Divider label="Itens" labelPosition="left" />
      <TabelaItens documento={v} />
      <Divider label="Contas a receber" labelPosition="left" />
      <ContasGeradas
        contas={v.contas ?? []}
        vazio={v.status === 'CANCELADA' ? 'Nenhuma conta.' : 'As contas a receber são lançadas no faturamento.'}
      />
      {vender && (
        <Group justify="flex-end" mt="sm">
          {podeCancelar && (
            <Button variant="subtle" color="red" onClick={() => setCancelando(true)}>
              Cancelar venda
            </Button>
          )}
          {(v.status === 'ORCAMENTO' || v.status === 'PEDIDO') && (
            <Button variant="default" onClick={() => aoEditar(v)}>
              Editar
            </Button>
          )}
          {v.status === 'ORCAMENTO' && (
            <Button loading={aprovar.isPending} onClick={() => aprovar.mutate()}>
              Aprovar como pedido
            </Button>
          )}
          {v.status === 'PEDIDO' && <Button onClick={() => aoFaturar(v)}>Faturar</Button>}
        </Group>
      )}
      <Confirmacao
        aberta={cancelando}
        titulo={`Cancelar venda nº ${v.numero}`}
        mensagem={
          v.status === 'FATURADA'
            ? 'Os produtos voltam ao estoque e as contas a receber desta venda são canceladas. Se alguma parcela já foi recebida, estorne o recebimento antes.'
            : 'A venda deixa de valer e, se for um pedido, libera a reserva de estoque.'
        }
        rotuloConfirmar="Cancelar venda"
        perigosa
        carregando={cancelar.isPending}
        aoConfirmar={() => cancelar.mutate()}
        aoFechar={() => setCancelando(false)}
      />
    </Stack>
  );
}

const ABAS: { value: StatusVenda | 'TODAS'; label: string }[] = [
  { value: 'TODAS', label: 'Todas' },
  { value: 'ORCAMENTO', label: 'Orçamentos' },
  { value: 'PEDIDO', label: 'Pedidos' },
  { value: 'FATURADA', label: 'Faturadas' },
  { value: 'CANCELADA', label: 'Canceladas' },
];

export function Vendas() {
  const { pode } = useSessao();
  const [aba, setAba] = useState<StatusVenda | 'TODAS'>('TODAS');
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [editando, setEditando] = useState<Venda | 'nova' | null>(null);
  const [faturando, setFaturando] = useState<Venda | null>(null);

  const clientes = useQuery({ queryKey: ['/clientes'], queryFn: () => api.get<Pessoa[]>('/clientes') });
  const filtro = consulta({ status: aba === 'TODAS' ? undefined : aba, clienteId });
  const lista = useQuery({ queryKey: ['/vendas', filtro], queryFn: () => api.get<Venda[]>(`/vendas${filtro}`) });
  const total = (lista.data ?? []).filter((v) => v.status !== 'CANCELADA').reduce((s, v) => s + Math.round(v.total * 100), 0) / 100;

  return (
    <>
      <Cabecalho
        titulo="Vendas"
        descricao="Orçamentos, pedidos e vendas faturadas"
        acoes={
          pode('vender') && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setEditando('nova')}>
              Nova venda
            </Button>
          )
        }
      />
      <Card withBorder padding={0}>
        <Tabs value={aba} onChange={(v) => setAba((v as typeof aba) ?? 'TODAS')}>
          <Tabs.List px="md" pt="xs">
            {ABAS.map((a) => (
              <Tabs.Tab key={a.value} value={a.value}>
                {a.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
        <Group p="md">
          <Select
            placeholder="Todos os clientes"
            aria-label="Cliente"
            data={(clientes.data ?? []).map((c) => ({ value: c.id, label: c.nome }))}
            value={clienteId}
            onChange={setClienteId}
            searchable
            clearable
            w={{ base: '100%', sm: 320 }}
          />
        </Group>
        {lista.isPending ? (
          <Loader m="md" />
        ) : lista.isError ? (
          <ErroCarregamento erro={lista.error} />
        ) : lista.data.length === 0 ? (
          <Text c="dimmed" p="md">
            Nenhuma venda encontrada.
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={620}>
            <Table highlightOnHover verticalSpacing="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={70}>Nº</Table.Th>
                  <Table.Th w={110}>Data</Table.Th>
                  <Table.Th>Cliente</Table.Th>
                  <Table.Th ta="right">Total</Table.Th>
                  <Table.Th w={120}>Situação</Table.Th>
                  <Table.Th w={48} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {lista.data.map((v) => (
                  <Table.Tr key={v.id} style={{ cursor: 'pointer' }} onClick={() => setAberta(v.id)}>
                    <Table.Td fw={600}>{v.numero}</Table.Td>
                    <Table.Td>{data(v.dataFaturamento ?? v.dataEmissao)}</Table.Td>
                    <Table.Td>{v.cliente.nome}</Table.Td>
                    <Table.Td ta="right" td={v.status === 'CANCELADA' ? 'line-through' : undefined}>
                      {moeda(v.total)}
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={STATUS_VENDA[v.status].cor}>
                        {STATUS_VENDA[v.status].rotulo}
                      </Badge>
                    </Table.Td>
                    <Table.Td onClick={(e) => e.stopPropagation()}>
                      <MenuAcoes
                        rotulo={`venda ${v.numero}`}
                        itens={[
                          { texto: 'Detalhes', aoClicar: () => setAberta(v.id) },
                          pode('vender') && v.status === 'PEDIDO' && { texto: 'Faturar', aoClicar: () => setAberta(v.id) },
                        ]}
                      />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
              <Table.Tfoot>
                <Table.Tr>
                  <Table.Th colSpan={3}>
                    {lista.data.length} {lista.data.length === 1 ? 'venda' : 'vendas'} (canceladas fora da soma)
                  </Table.Th>
                  <Table.Th ta="right">{moeda(total)}</Table.Th>
                  <Table.Th colSpan={2} />
                </Table.Tr>
              </Table.Tfoot>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>

      <Drawer opened={aberta !== null} onClose={() => setAberta(null)} title="Detalhes da venda" position="right" size="lg">
        {aberta && <Detalhe id={aberta} aoEditar={setEditando} aoFaturar={setFaturando} />}
      </Drawer>
      <Modal
        opened={editando !== null}
        onClose={() => setEditando(null)}
        title={editando === 'nova' ? 'Nova venda' : `Editar venda nº ${editando?.numero}`}
        size="70rem"
      >
        {editando !== null && (
          <FormDocumento
            config={CONFIG_VENDA}
            documento={editando === 'nova' ? null : editando}
            aoFechar={() => setEditando(null)}
            aoSalvar={(salva) => setAberta(salva.id)}
          />
        )}
      </Modal>
      <Modal opened={faturando !== null} onClose={() => setFaturando(null)} title={`Faturar venda nº ${faturando?.numero}`} size="lg">
        {faturando && <FormFaturar venda={faturando} aoFechar={() => setFaturando(null)} />}
      </Modal>
    </>
  );
}

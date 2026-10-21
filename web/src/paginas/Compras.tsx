import { Badge, Button, Card, Divider, Drawer, Group, Loader, Modal, Select, Stack, Table, Tabs, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { api, consulta } from '../api/cliente';
import type { Compra, Pessoa, StatusCompra } from '../api/tipos';
import { avisarErro, avisarSucesso, Cabecalho, CampoData, Confirmacao, ErroCarregamento, MenuAcoes, SemPermissao } from '../componentes/comum';
import { BotaoPdf, type ConfigDocumento, ContasGeradas, FormDocumento, TabelaItens } from '../componentes/Documento';
import { useSessao } from '../sessao/sessao';
import { data, hoje, moeda } from '../util/formato';

export const CONFIG_COMPRA: ConfigDocumento = {
  rota: '/compras',
  nome: 'compra',
  pessoa: { campo: 'fornecedorId', rota: '/fornecedores', rotulo: 'Fornecedor' },
  tipoCategoria: 'DESPESA',
  preco: { campo: 'custoUnitario', rotulo: 'Custo unitário', padrao: (p) => p.custo ?? 0 },
  comDesconto: false,
  soProdutos: true,
  momentoContas: 'no recebimento',
};

const STATUS_COMPRA: Record<StatusCompra, { rotulo: string; cor: string }> = {
  PEDIDO: { rotulo: 'Pedido', cor: 'blue' },
  RECEBIDA: { rotulo: 'Recebida', cor: 'teal' },
  CANCELADA: { rotulo: 'Cancelada', cor: 'red' },
};

function useInvalidar() {
  const queryClient = useQueryClient();
  return () => {
    for (const chave of ['/compras', 'compra', 'estoque', '/produtos', '/contas-pagar', 'saldos', 'fluxo-caixa', 'dre']) {
      queryClient.invalidateQueries({ queryKey: [chave] });
    }
  };
}

function FormReceber({ compra, aoFechar }: { compra: Compra; aoFechar: () => void }) {
  const invalidar = useInvalidar();
  const [dataRecebimento, setData] = useState<string | null>(hoje());
  const receber = useMutation({
    mutationFn: () => api.post<Compra>(`/compras/${compra.id}/recebimento`, { data: dataRecebimento }),
    onSuccess: (recebida) => {
      invalidar();
      avisarSucesso(`Compra nº ${compra.numero} recebida; ${recebida.contas?.length ?? 0} conta(s) a pagar lançada(s)`);
      aoFechar();
    },
    onError: avisarErro,
  });
  const vencimento = compra.primeiroVencimento ?? dataRecebimento;
  return (
    <Stack>
      <Text size="sm">
        A mercadoria entra no estoque pelo custo de cada item, que entra no custo médio dos produtos.
        {compra.total > 0 && (
          <>
            {' '}
            {compra.parcelas > 1 ? `${compra.parcelas} parcelas mensais` : 'Uma conta'} de <b>{moeda(compra.total)}</b>{' '}
            {compra.parcelas > 1 ? 'são lançadas' : 'é lançada'} em contas a pagar{vencimento && `, a partir de ${data(vencimento)}`}.
          </>
        )}
      </Text>
      <CampoData label="Data do recebimento" value={dataRecebimento} onChange={setData} />
      <Group justify="flex-end">
        <Button variant="default" onClick={aoFechar}>
          Voltar
        </Button>
        <Button loading={receber.isPending} disabled={!dataRecebimento} onClick={() => receber.mutate()}>
          Confirmar recebimento
        </Button>
      </Group>
    </Stack>
  );
}

function Detalhe({ id, aoEditar, aoReceber }: { id: string; aoEditar: (c: Compra) => void; aoReceber: (c: Compra) => void }) {
  const { pode } = useSessao();
  const invalidar = useInvalidar();
  const [cancelando, setCancelando] = useState(false);
  const compra = useQuery({ queryKey: ['compra', id], queryFn: () => api.get<Compra>(`/compras/${id}`) });
  const cancelar = useMutation({
    mutationFn: () => api.post<Compra>(`/compras/${id}/cancelamento`),
    onSuccess: (cancelada) => {
      invalidar();
      avisarSucesso('Compra cancelada');
      if (cancelada.avisos?.length) {
        notifications.show({ color: 'yellow', title: 'Atenção ao estoque', message: cancelada.avisos.join(' · '), autoClose: 10000 });
      }
    },
    onError: avisarErro,
    onSettled: () => setCancelando(false),
  });

  if (compra.isPending) return <Loader />;
  if (compra.isError) return <ErroCarregamento erro={compra.error} />;
  const c = compra.data;
  const escrever = pode('escreverFinanceiro');
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
          Compra nº {c.numero}
        </Text>
        <Group gap="xs">
          <BotaoPdf rota={`/compras/${c.id}`} nome={`Pedido-de-compra-${c.numero}.pdf`} />
          <Badge color={STATUS_COMPRA[c.status].cor} variant="light" size="lg">
            {STATUS_COMPRA[c.status].rotulo}
          </Badge>
        </Group>
      </Group>
      {linha('Fornecedor', c.fornecedor.nome)}
      {linha('Pedido em', data(c.dataEmissao))}
      {c.dataRecebimento && linha('Recebida em', data(c.dataRecebimento))}
      {linha('Pagamento', `${c.parcelas === 1 ? 'Parcela única' : `${c.parcelas}x mensais`}${c.primeiroVencimento ? `, a partir de ${data(c.primeiroVencimento)}` : ', à vista no recebimento'}`)}
      {linha('Categoria', c.planoConta ? `${c.planoConta.codigo} ${c.planoConta.nome}` : '—')}
      {c.observacoes && (
        <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
          {c.observacoes}
        </Text>
      )}
      <Divider label="Itens" labelPosition="left" />
      <TabelaItens documento={c} />
      <Divider label="Contas a pagar" labelPosition="left" />
      <ContasGeradas contas={c.contas ?? []} vazio={c.status === 'CANCELADA' ? 'Nenhuma conta.' : 'As contas a pagar são lançadas no recebimento.'} />
      {escrever && c.status !== 'CANCELADA' && (
        <Group justify="flex-end" mt="sm">
          <Button variant="subtle" color="red" onClick={() => setCancelando(true)}>
            Cancelar compra
          </Button>
          {c.status === 'PEDIDO' && (
            <>
              <Button variant="default" onClick={() => aoEditar(c)}>
                Editar
              </Button>
              <Button onClick={() => aoReceber(c)}>Receber mercadoria</Button>
            </>
          )}
        </Group>
      )}
      <Confirmacao
        aberta={cancelando}
        titulo={`Cancelar compra nº ${c.numero}`}
        mensagem={
          c.status === 'RECEBIDA'
            ? 'A mercadoria sai do estoque, o custo médio é recalculado e as contas a pagar desta compra são canceladas. Se alguma parcela já foi paga, estorne o pagamento antes.'
            : 'O pedido de compra deixa de valer.'
        }
        rotuloConfirmar="Cancelar compra"
        perigosa
        carregando={cancelar.isPending}
        aoConfirmar={() => cancelar.mutate()}
        aoFechar={() => setCancelando(false)}
      />
    </Stack>
  );
}

const ABAS: { value: StatusCompra | 'TODAS'; label: string }[] = [
  { value: 'TODAS', label: 'Todas' },
  { value: 'PEDIDO', label: 'A receber' },
  { value: 'RECEBIDA', label: 'Recebidas' },
  { value: 'CANCELADA', label: 'Canceladas' },
];

export function Compras() {
  const { pode } = useSessao();
  const [aba, setAba] = useState<StatusCompra | 'TODAS'>('TODAS');
  const [fornecedorId, setFornecedorId] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [editando, setEditando] = useState<Compra | 'nova' | null>(null);
  const [recebendo, setRecebendo] = useState<Compra | null>(null);
  const permitido = pode('verSaldos');

  const fornecedores = useQuery({ queryKey: ['/fornecedores'], queryFn: () => api.get<Pessoa[]>('/fornecedores'), enabled: permitido });
  const filtro = consulta({ status: aba === 'TODAS' ? undefined : aba, fornecedorId });
  const lista = useQuery({ queryKey: ['/compras', filtro], queryFn: () => api.get<Compra[]>(`/compras${filtro}`), enabled: permitido });

  if (!permitido) return <SemPermissao titulo="Compras" />;
  return (
    <>
      <Cabecalho
        titulo="Compras"
        descricao="Pedidos a fornecedores; ao receber, a mercadoria entra no estoque e as contas a pagar são lançadas"
        acoes={
          pode('escreverFinanceiro') && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setEditando('nova')}>
              Nova compra
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
            placeholder="Todos os fornecedores"
            aria-label="Fornecedor"
            data={(fornecedores.data ?? []).map((f) => ({ value: f.id, label: f.nome }))}
            value={fornecedorId}
            onChange={setFornecedorId}
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
            Nenhuma compra encontrada.
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={620}>
            <Table highlightOnHover verticalSpacing="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={70}>Nº</Table.Th>
                  <Table.Th w={110}>Data</Table.Th>
                  <Table.Th>Fornecedor</Table.Th>
                  <Table.Th ta="right">Total</Table.Th>
                  <Table.Th w={120}>Situação</Table.Th>
                  <Table.Th w={48} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {lista.data.map((c) => (
                  <Table.Tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setAberta(c.id)}>
                    <Table.Td fw={600}>{c.numero}</Table.Td>
                    <Table.Td>{data(c.dataRecebimento ?? c.dataEmissao)}</Table.Td>
                    <Table.Td>{c.fornecedor.nome}</Table.Td>
                    <Table.Td ta="right" td={c.status === 'CANCELADA' ? 'line-through' : undefined}>
                      {moeda(c.total)}
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={STATUS_COMPRA[c.status].cor}>
                        {STATUS_COMPRA[c.status].rotulo}
                      </Badge>
                    </Table.Td>
                    <Table.Td onClick={(e) => e.stopPropagation()}>
                      <MenuAcoes rotulo={`compra ${c.numero}`} itens={[{ texto: 'Detalhes', aoClicar: () => setAberta(c.id) }]} />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>

      <Drawer opened={aberta !== null} onClose={() => setAberta(null)} title="Detalhes da compra" position="right" size="lg">
        {aberta && <Detalhe id={aberta} aoEditar={setEditando} aoReceber={setRecebendo} />}
      </Drawer>
      <Modal
        opened={editando !== null}
        onClose={() => setEditando(null)}
        title={editando === 'nova' ? 'Nova compra' : `Editar compra nº ${editando?.numero}`}
        size="70rem"
      >
        {editando !== null && (
          <FormDocumento
            config={CONFIG_COMPRA}
            documento={editando === 'nova' ? null : editando}
            aoFechar={() => setEditando(null)}
            aoSalvar={(salva) => setAberta(salva.id)}
          />
        )}
      </Modal>
      <Modal opened={recebendo !== null} onClose={() => setRecebendo(null)} title={`Receber compra nº ${recebendo?.numero}`} size="lg">
        {recebendo && <FormReceber compra={recebendo} aoFechar={() => setRecebendo(null)} />}
      </Modal>
    </>
  );
}

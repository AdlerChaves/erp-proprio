import { Badge, Button, Divider, Drawer, Group, Loader, Modal, SegmentedControl, Select, Stack, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { api, consulta } from '../api/cliente';
import type { Compra, Pessoa, StatusCompra } from '../api/tipos';
import { avisarErro, avisarSucesso, Cabecalho, CampoData, Confirmacao, ErroCarregamento, EstadoVazio, MenuAcoes, SemPermissao, Valor } from '../componentes/comum';
import { Corta, TabelaDados } from '../componentes/TabelaDados';
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
      <TabelaDados<Compra>
        linhas={lista.data}
        erro={lista.error}
        aoTentarDeNovo={() => lista.refetch()}
        chave={(c) => c.id}
        contagem={['compra', 'compras']}
        placeholderBusca="Buscar número ou fornecedor"
        textoBusca={(c) => `${c.numero} ${c.fornecedor.nome} ${moeda(c.total)}`}
        ordemInicial={{ coluna: 'numero', direcao: 'desc' }}
        larguraMinima={640}
        aoClicarLinha={(c) => setAberta(c.id)}
        filtros={
          <>
            <SegmentedControl value={aba} onChange={(v) => setAba(v as typeof aba)} data={ABAS} aria-label="Situação" />
            <Select
              placeholder="Todos os fornecedores"
              aria-label="Fornecedor"
              data={(fornecedores.data ?? []).map((f) => ({ value: f.id, label: f.nome }))}
              value={fornecedorId}
              onChange={setFornecedorId}
              searchable
              clearable
              w={240}
            />
          </>
        }
        vazio={
          <EstadoVazio
            mensagem={aba === 'TODAS' && !fornecedorId ? 'Nenhuma compra ainda.' : 'Nenhuma compra com estes filtros.'}
            acao={
              pode('escreverFinanceiro') && (
                <Button variant="default" size="xs" leftSection={<IconPlus size={14} />} onClick={() => setEditando('nova')}>
                  Nova compra
                </Button>
              )
            }
          />
        }
        colunas={[
          { id: 'numero', titulo: 'Nº', largura: 80, ordenar: (c) => c.numero, celula: (c) => <Text fw={600} size="sm">{c.numero}</Text> },
          {
            id: 'data',
            titulo: 'Data',
            largura: 110,
            ordenar: (c) => c.dataRecebimento ?? c.dataEmissao,
            celula: (c) => data(c.dataRecebimento ?? c.dataEmissao),
          },
          { id: 'fornecedor', titulo: 'Fornecedor', ordenar: (c) => c.fornecedor.nome, celula: (c) => <Corta>{c.fornecedor.nome}</Corta> },
          {
            id: 'total',
            titulo: 'Total',
            alinhar: 'right',
            largura: 140,
            ordenar: (c) => c.total,
            celula: (c) => (
              <Text size="sm" span td={c.status === 'CANCELADA' ? 'line-through' : undefined}>
                <Valor valor={c.total} />
              </Text>
            ),
          },
          {
            id: 'situacao',
            titulo: 'Situação',
            largura: 120,
            ordenar: (c) => STATUS_COMPRA[c.status].rotulo,
            celula: (c) => <Badge color={STATUS_COMPRA[c.status].cor}>{STATUS_COMPRA[c.status].rotulo}</Badge>,
          },
        ]}
        acoes={(c) => <MenuAcoes rotulo={`compra ${c.numero}`} itens={[{ texto: 'Detalhes', aoClicar: () => setAberta(c.id) }]} />}
        rodape={(visiveis) => (
          <>
            <Table.Th colSpan={3}>Total, sem as canceladas</Table.Th>
            <Table.Th ta="right">
              <Valor valor={visiveis.filter((c) => c.status !== 'CANCELADA').reduce((s, c) => s + Math.round(c.total * 100), 0) / 100} />
            </Table.Th>
            <Table.Th colSpan={2} />
          </>
        )}
      />

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

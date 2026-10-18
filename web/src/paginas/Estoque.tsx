import { Badge, Button, Card, Drawer, Group, Loader, Modal, SegmentedControl, SimpleGrid, Stack, Table, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconSearch } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '../api/cliente';
import type { MovimentacaoEstoque, OrigemMovimentacaoEstoque, PosicaoEstoque, TipoMovimentacao } from '../api/tipos';
import { avisarErro, avisarSucesso, Cabecalho, CampoData, CampoMoeda, ErroCarregamento, MenuAcoes } from '../componentes/comum';
import { CampoQuantidade } from '../componentes/Documento';
import { useSessao } from '../sessao/sessao';
import { data, hoje, moeda, qtd } from '../util/formato';

type ItemPosicao = PosicaoEstoque['itens'][number];

const ORIGENS: Record<OrigemMovimentacaoEstoque, { rotulo: string; cor: string }> = {
  COMPRA: { rotulo: 'Compra', cor: 'teal' },
  VENDA: { rotulo: 'Venda', cor: 'blue' },
  AJUSTE: { rotulo: 'Ajuste', cor: 'gray' },
  ESTORNO_COMPRA: { rotulo: 'Compra cancelada', cor: 'orange' },
  ESTORNO_VENDA: { rotulo: 'Venda cancelada', cor: 'orange' },
};

function FormAjuste({ item, aoFechar }: { item: ItemPosicao; aoFechar: () => void }) {
  const queryClient = useQueryClient();
  const form = useForm({
    initialValues: {
      tipo: 'ENTRADA' as TipoMovimentacao,
      quantidade: '' as number | '',
      custoUnitario: item.custoMedio ?? ('' as number | ''),
      data: hoje() as string | null,
      motivo: '',
    },
    validate: {
      quantidade: (v) => (Number(v) > 0 ? null : 'Informe uma quantidade maior que zero'),
      motivo: (v) => (v.trim() ? null : 'Explique o ajuste, como "Inventário" ou "Quebra"'),
      data: (v) => (v ? null : 'Informe a data'),
    },
  });
  const entrada = form.values.tipo === 'ENTRADA';
  const saldoDepois = item.estoque + (entrada ? 1 : -1) * Number(form.values.quantidade || 0);

  const salvar = useMutation({
    mutationFn: (v: typeof form.values) =>
      api.post<{ avisos: string[] }>('/estoque/ajustes', {
        produtoId: item.produto.id,
        tipo: v.tipo,
        quantidade: Number(v.quantidade),
        custoUnitario: entrada && v.custoUnitario !== '' ? Number(v.custoUnitario) : undefined,
        data: v.data,
        motivo: v.motivo.trim(),
      }),
    onSuccess: ({ avisos }) => {
      for (const chave of ['estoque', '/produtos']) queryClient.invalidateQueries({ queryKey: [chave] });
      avisarSucesso('Ajuste registrado');
      if (avisos.length) notifications.show({ color: 'yellow', title: 'Atenção ao estoque', message: avisos.join(' · ') });
      aoFechar();
    },
    onError: avisarErro,
  });

  return (
    <form onSubmit={form.onSubmit((v) => salvar.mutate(v))}>
      <Stack>
        <Text size="sm">
          {item.produto.descricao} · em estoque <b>{qtd(item.estoque)} {item.produto.unidade}</b>
        </Text>
        <SegmentedControl data={[{ value: 'ENTRADA', label: 'Entrada' }, { value: 'SAIDA', label: 'Saída' }]} {...form.getInputProps('tipo')} />
        <SimpleGrid cols={{ base: 1, xs: entrada ? 3 : 2 }}>
          <CampoQuantidade label="Quantidade" rightSection={<Text size="xs" c="dimmed">{item.produto.unidade}</Text>} data-autofocus {...form.getInputProps('quantidade')} />
          {entrada && <CampoMoeda label="Custo unitário" description="Entra no custo médio" {...form.getInputProps('custoUnitario')} />}
          <CampoData label="Data" {...form.getInputProps('data')} />
        </SimpleGrid>
        <TextInput label="Motivo" placeholder={entrada ? 'Inventário de outubro' : 'Quebra no transporte'} {...form.getInputProps('motivo')} />
        {form.values.quantidade !== '' && (
          <Text size="sm" c={saldoDepois < 0 ? 'orange.8' : 'dimmed'}>
            O estoque passa a {qtd(saldoDepois)} {item.produto.unidade}
            {saldoDepois < 0 && ' (negativo)'}.
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" loading={salvar.isPending}>
            Registrar ajuste
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

function Kardex({ item }: { item: ItemPosicao }) {
  const movs = useQuery({
    queryKey: ['estoque', 'movimentacoes', item.produto.id],
    queryFn: () => api.get<MovimentacaoEstoque[]>(`/estoque/movimentacoes?produtoId=${item.produto.id}`),
  });
  if (movs.isPending) return <Loader />;
  if (movs.isError) return <ErroCarregamento erro={movs.error} />;
  if (movs.data.length === 0) return <Text c="dimmed">Nenhuma movimentação ainda.</Text>;
  return (
    <Table.ScrollContainer minWidth={560}>
      <Table verticalSpacing="xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Data</Table.Th>
            <Table.Th>Movimentação</Table.Th>
            <Table.Th ta="right">Entrada</Table.Th>
            <Table.Th ta="right">Saída</Table.Th>
            <Table.Th ta="right">Saldo</Table.Th>
            <Table.Th ta="right">Custo</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {/* Mais recentes primeiro; o saldo de cada linha é o de logo após ela. */}
          {[...movs.data].reverse().map((m) => (
            <Table.Tr key={m.id}>
              <Table.Td>{data(m.data)}</Table.Td>
              <Table.Td>
                <Badge size="sm" variant="light" color={ORIGENS[m.origem].cor} mr={6}>
                  {ORIGENS[m.origem].rotulo}
                </Badge>
                <Text span size="sm">
                  {m.descricao}
                </Text>
              </Table.Td>
              <Table.Td ta="right" c="teal.8">
                {m.tipo === 'ENTRADA' ? qtd(m.quantidade) : ''}
              </Table.Td>
              <Table.Td ta="right" c="red.7">
                {m.tipo === 'SAIDA' ? qtd(m.quantidade) : ''}
              </Table.Td>
              <Table.Td ta="right" fw={600} c={m.saldo < 0 ? 'red.7' : undefined}>
                {qtd(m.saldo)}
              </Table.Td>
              <Table.Td ta="right" c="dimmed">
                {moeda(m.custoUnitario)}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

export function Estoque() {
  const { pode } = useSessao();
  const [busca, setBusca] = useState('');
  const [ajustando, setAjustando] = useState<ItemPosicao | null>(null);
  const [kardex, setKardex] = useState<ItemPosicao | null>(null);
  const posicao = useQuery({ queryKey: ['estoque'], queryFn: () => api.get<PosicaoEstoque>('/estoque') });

  const itens = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (posicao.data?.itens ?? []).filter(
      (i) => !termo || i.produto.codigo.toLowerCase().includes(termo) || i.produto.descricao.toLowerCase().includes(termo),
    );
  }, [posicao.data, busca]);
  const negativos = (posicao.data?.itens ?? []).filter((i) => i.estoque < 0).length;
  const ajustar = pode('escreverFinanceiro');

  return (
    <>
      <Cabecalho titulo="Estoque" descricao="Saldo de cada produto, o que está reservado em pedidos e o valor ao custo médio" />
      <Card withBorder padding={0}>
        <Group p="md" justify="space-between" wrap="wrap">
          <TextInput
            placeholder="Buscar por código ou descrição"
            leftSection={<IconSearch size={16} />}
            value={busca}
            onChange={(e) => setBusca(e.currentTarget.value)}
            w={{ base: '100%', sm: 320 }}
          />
          <Group gap="xl">
            {negativos > 0 && (
              <Text size="sm" c="red.7" fw={500}>
                {negativos} {negativos === 1 ? 'produto' : 'produtos'} com estoque negativo
              </Text>
            )}
            {posicao.data && (
              <div>
                <Text size="xs" c="dimmed">
                  Valor em estoque
                </Text>
                <Text fw={700} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {moeda(posicao.data.valorTotal)}
                </Text>
              </div>
            )}
          </Group>
        </Group>
        {posicao.isPending ? (
          <Loader m="md" />
        ) : posicao.isError ? (
          <ErroCarregamento erro={posicao.error} />
        ) : itens.length === 0 ? (
          <Text c="dimmed" p="md">
            {busca ? 'Nada encontrado.' : 'Nenhum produto cadastrado. Serviços não aparecem aqui, porque não têm estoque.'}
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={760}>
            <Table highlightOnHover verticalSpacing="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Código</Table.Th>
                  <Table.Th>Produto</Table.Th>
                  <Table.Th ta="right">Em estoque</Table.Th>
                  <Table.Th ta="right">Reservado</Table.Th>
                  <Table.Th ta="right">Disponível</Table.Th>
                  <Table.Th ta="right">Custo médio</Table.Th>
                  <Table.Th ta="right">Valor</Table.Th>
                  <Table.Th w={48} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {itens.map((i) => (
                  <Table.Tr key={i.produto.id} c={i.produto.ativo ? undefined : 'dimmed'}>
                    <Table.Td ff="monospace" style={{ whiteSpace: 'nowrap' }}>
                      {i.produto.codigo}
                    </Table.Td>
                    <Table.Td>{i.produto.descricao}</Table.Td>
                    <Table.Td ta="right" fw={600} c={i.estoque < 0 ? 'red.7' : undefined}>
                      {qtd(i.estoque)} {i.produto.unidade}
                    </Table.Td>
                    <Table.Td ta="right" c={i.reservado > 0 ? undefined : 'dimmed'}>
                      {qtd(i.reservado)}
                    </Table.Td>
                    <Table.Td ta="right" c={i.disponivel < 0 ? 'orange.8' : undefined}>
                      {qtd(i.disponivel)}
                    </Table.Td>
                    <Table.Td ta="right">{i.custoMedio === null ? '—' : moeda(i.custoMedio)}</Table.Td>
                    <Table.Td ta="right">{moeda(i.valorEstoque)}</Table.Td>
                    <Table.Td>
                      <MenuAcoes
                        rotulo={i.produto.descricao}
                        itens={[
                          { texto: 'Movimentações', aoClicar: () => setKardex(i) },
                          ajustar && { texto: 'Ajustar estoque', aoClicar: () => setAjustando(i) },
                        ]}
                      />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>
      <Text size="xs" c="dimmed" mt="xs">
        Reservado é o que está em pedidos ainda não faturados. Disponível = em estoque − reservado.
      </Text>

      <Modal opened={ajustando !== null} onClose={() => setAjustando(null)} title="Ajustar estoque" size="lg">
        {ajustando && <FormAjuste item={ajustando} aoFechar={() => setAjustando(null)} />}
      </Modal>
      <Drawer opened={kardex !== null} onClose={() => setKardex(null)} title={`Movimentações · ${kardex?.produto.descricao ?? ''}`} position="right" size="xl">
        {kardex && <Kardex item={kardex} />}
      </Drawer>
    </>
  );
}

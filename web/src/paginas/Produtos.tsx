import { Button, Card, Group, Loader, Modal, SegmentedControl, SimpleGrid, Stack, Switch, Table, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '../api/cliente';
import type { Produto, TipoProduto } from '../api/tipos';
import { avisarErro, avisarSucesso, Cabecalho, CampoMoeda, Confirmacao, ErroCarregamento, MenuAcoes, SituacaoAtivo } from '../componentes/comum';
import { CampoServicoNacional } from '../componentes/Fiscal';
import { useSessao } from '../sessao/sessao';
import { digitos, moeda } from '../util/formato';

const TIPOS: { value: TipoProduto; label: string }[] = [
  { value: 'PRODUTO', label: 'Produto' },
  { value: 'SERVICO', label: 'Serviço' },
];

function FormProduto({ produto, aoFechar }: { produto: Produto | null; aoFechar: () => void }) {
  const queryClient = useQueryClient();
  const form = useForm({
    initialValues: {
      tipo: (produto?.tipo ?? 'PRODUTO') as TipoProduto,
      codigo: produto?.codigo ?? '',
      descricao: produto?.descricao ?? '',
      unidade: produto?.unidade ?? 'UN',
      precoVenda: produto?.precoVenda ?? ('' as number | ''),
      custo: produto?.custo ?? ('' as number | ''),
      ncm: produto?.ncm ?? '',
      codigoServico: produto?.codigoServico ?? '',
      codigoTributacaoNacional: produto?.codigoTributacaoNacional ?? (null as string | null),
      codigoNbs: produto?.codigoNbs ?? '',
      ativo: produto?.ativo ?? true,
    },
    validate: {
      codigo: (v) => (v.trim() ? null : 'Informe o código interno (SKU)'),
      descricao: (v) => (v.trim() ? null : 'Descreva o item'),
      unidade: (v) => (/^\S{1,6}$/.test(v.trim()) ? null : 'Até 6 letras, como UN, KG, H'),
      precoVenda: (v) => (v !== '' && Number(v) >= 0 ? null : 'Informe o preço de venda'),
      ncm: (v, c) => (c.tipo !== 'PRODUTO' || !v || /^\d{8}$/.test(digitos(v)) ? null : 'O NCM tem 8 dígitos'),
      codigoServico: (v, c) => (c.tipo !== 'SERVICO' || !v || /^\d{2}\.\d{2}$/.test(v.trim()) ? null : 'Formato 00.00, como 01.07'),
      codigoTributacaoNacional: (v, c) =>
        c.tipo !== 'SERVICO' || !v || !c.codigoServico || v.startsWith(c.codigoServico.replace('.', ''))
          ? null
          : `Não corresponde ao item ${c.codigoServico} da LC 116`,
      codigoNbs: (v, c) => (c.tipo !== 'SERVICO' || !v || /^\d{9}$/.test(digitos(v)) ? null : 'O NBS tem 9 dígitos'),
    },
  });
  const servico = form.values.tipo === 'SERVICO';

  const salvar = useMutation({
    mutationFn: (v: typeof form.values) => {
      const corpo = {
        tipo: v.tipo,
        codigo: v.codigo.trim(),
        descricao: v.descricao.trim(),
        unidade: v.unidade.trim(),
        precoVenda: Number(v.precoVenda),
        // null limpa o campo na alteração. A API recusa NCM em serviço e código de serviço em produto.
        custo: v.custo === '' ? null : Number(v.custo),
        ncm: servico || !v.ncm ? null : digitos(v.ncm),
        codigoServico: !servico || !v.codigoServico ? null : v.codigoServico.trim(),
        codigoTributacaoNacional: servico ? v.codigoTributacaoNacional : null,
        codigoNbs: servico && v.codigoNbs ? digitos(v.codigoNbs) : null,
        ativo: v.ativo,
      };
      return produto ? api.patch(`/produtos/${produto.id}`, corpo) : api.post('/produtos', corpo);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/produtos'] });
      avisarSucesso(produto ? 'Alterações salvas' : 'Item cadastrado');
      aoFechar();
    },
    onError: avisarErro,
  });

  return (
    <form onSubmit={form.onSubmit((v) => salvar.mutate(v))}>
      <Stack>
        <SegmentedControl data={TIPOS} {...form.getInputProps('tipo')} />
        <SimpleGrid cols={{ base: 1, xs: 3 }}>
          <TextInput label="Código" placeholder="SKU-001" data-autofocus {...form.getInputProps('codigo')} />
          <TextInput label="Unidade" placeholder={servico ? 'H' : 'UN'} {...form.getInputProps('unidade')} />
          {servico ? (
            <TextInput label="Código do serviço" description="Item da LC 116, opcional" placeholder="01.07" {...form.getInputProps('codigoServico')} />
          ) : (
            <TextInput label="NCM" description="8 dígitos, opcional" {...form.getInputProps('ncm')} />
          )}
        </SimpleGrid>
        <TextInput label="Descrição" {...form.getInputProps('descricao')} />
        {servico && (
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <CampoServicoNacional
              label="Código de tributação nacional"
              description="Lista nacional da NFS-e; necessário para emitir a nota"
              style={{ gridColumn: 'span 2' }}
              value={form.values.codigoTributacaoNacional}
              onChange={(codigo) => {
                form.setFieldValue('codigoTributacaoNacional', codigo);
                // O código LC 116 (00.00) é o começo do código nacional; preenche se estiver vazio.
                if (codigo && !form.values.codigoServico) form.setFieldValue('codigoServico', `${codigo.slice(0, 2)}.${codigo.slice(2, 4)}`);
              }}
              error={form.errors.codigoTributacaoNacional}
            />
            <TextInput label="NBS" description="9 dígitos, opcional" {...form.getInputProps('codigoNbs')} />
          </SimpleGrid>
        )}
        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <CampoMoeda label="Preço de venda" {...form.getInputProps('precoVenda')} />
          <CampoMoeda label="Custo" description="Opcional" {...form.getInputProps('custo')} />
        </SimpleGrid>
        <Switch label="Ativo" {...form.getInputProps('ativo', { type: 'checkbox' })} />
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

export function Produtos() {
  const { pode } = useSessao();
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState<'TODOS' | TipoProduto>('TODOS');
  const [editando, setEditando] = useState<Produto | 'novo' | null>(null);
  const [removendo, setRemovendo] = useState<Produto | null>(null);
  const lista = useQuery({ queryKey: ['/produtos'], queryFn: () => api.get<Produto[]>('/produtos') });

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (lista.data ?? []).filter(
      (p) =>
        (tipo === 'TODOS' || p.tipo === tipo) &&
        (!termo || p.codigo.toLowerCase().includes(termo) || p.descricao.toLowerCase().includes(termo)),
    );
  }, [lista.data, busca, tipo]);

  const remover = useMutation({
    mutationFn: (p: Produto) => api.delete(`/produtos/${p.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/produtos'] });
      avisarSucesso('Item removido');
    },
    onError: avisarErro,
    onSettled: () => setRemovendo(null),
  });

  const escrever = pode('escreverProdutos');
  return (
    <>
      <Cabecalho
        titulo="Produtos e serviços"
        descricao="Itens que a empresa vende"
        acoes={
          escrever && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setEditando('novo')}>
              Novo item
            </Button>
          )
        }
      />
      <Card withBorder padding={0}>
        <Group p="md" wrap="wrap">
          <TextInput
            placeholder="Buscar por código ou descrição"
            leftSection={<IconSearch size={16} />}
            value={busca}
            onChange={(e) => setBusca(e.currentTarget.value)}
            w={{ base: '100%', sm: 320 }}
          />
          <SegmentedControl
            value={tipo}
            onChange={(v) => setTipo(v as typeof tipo)}
            data={[{ value: 'TODOS', label: 'Todos' }, { value: 'PRODUTO', label: 'Produtos' }, { value: 'SERVICO', label: 'Serviços' }]}
          />
        </Group>
        {lista.isPending ? (
          <Loader m="md" />
        ) : lista.isError ? (
          <ErroCarregamento erro={lista.error} />
        ) : filtrados.length === 0 ? (
          <Text c="dimmed" p="md">
            {busca || tipo !== 'TODOS' ? 'Nada encontrado.' : 'Nenhum produto ou serviço cadastrado.'}
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={720}>
            <Table highlightOnHover verticalSpacing="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Código</Table.Th>
                  <Table.Th>Descrição</Table.Th>
                  <Table.Th>Tipo</Table.Th>
                  <Table.Th>Unid.</Table.Th>
                  <Table.Th ta="right">Preço</Table.Th>
                  <Table.Th ta="right">Custo</Table.Th>
                  <Table.Th w={110}>Situação</Table.Th>
                  {escrever && <Table.Th w={48} />}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filtrados.map((p) => (
                  <Table.Tr key={p.id}>
                    <Table.Td ff="monospace">{p.codigo}</Table.Td>
                    <Table.Td fw={500}>{p.descricao}</Table.Td>
                    <Table.Td>{p.tipo === 'SERVICO' ? 'Serviço' : 'Produto'}</Table.Td>
                    <Table.Td>{p.unidade}</Table.Td>
                    <Table.Td ta="right">{moeda(p.precoVenda)}</Table.Td>
                    <Table.Td ta="right" c="dimmed">
                      {p.custo === null ? '—' : moeda(p.custo)}
                    </Table.Td>
                    <Table.Td>
                      <SituacaoAtivo ativo={p.ativo} />
                    </Table.Td>
                    {escrever && (
                      <Table.Td>
                        <MenuAcoes
                          rotulo={p.descricao}
                          itens={[
                            { texto: 'Editar', aoClicar: () => setEditando(p) },
                            pode('remover') && { texto: 'Remover', aoClicar: () => setRemovendo(p), perigosa: true },
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
      <Modal opened={editando !== null} onClose={() => setEditando(null)} title={editando === 'novo' ? 'Novo item' : 'Editar item'} size="lg">
        {editando !== null && <FormProduto produto={editando === 'novo' ? null : editando} aoFechar={() => setEditando(null)} />}
      </Modal>
      <Confirmacao
        aberta={removendo !== null}
        titulo="Remover item"
        mensagem={`Remover ${removendo?.descricao}? Para manter o histórico, prefira desativar.`}
        rotuloConfirmar="Remover"
        perigosa
        carregando={remover.isPending}
        aoConfirmar={() => removendo && remover.mutate(removendo)}
        aoFechar={() => setRemovendo(null)}
      />
    </>
  );
}

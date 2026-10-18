import { Button, Card, Group, Loader, Modal, Stack, Switch, Table, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/cliente';
import type { CentroCusto } from '../api/tipos';
import { avisarErro, avisarSucesso, Cabecalho, Confirmacao, ErroCarregamento, MenuAcoes, SituacaoAtivo } from '../componentes/comum';
import { useSessao } from '../sessao/sessao';

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

export function CentrosCusto() {
  const { pode } = useSessao();
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<CentroCusto | 'novo' | null>(null);
  const [removendo, setRemovendo] = useState<CentroCusto | null>(null);
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
  return (
    <>
      <Cabecalho
        titulo="Centros de custo"
        descricao="Departamentos, lojas ou projetos para separar receitas e despesas"
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
                  <Table.Tr key={c.id}>
                    <Table.Td fw={500}>{c.nome}</Table.Td>
                    <Table.Td c="dimmed">{c.descricao}</Table.Td>
                    <Table.Td>
                      <SituacaoAtivo ativo={c.ativo} />
                    </Table.Td>
                    {escrever && (
                      <Table.Td>
                        <MenuAcoes
                          rotulo={c.nome}
                          itens={[
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

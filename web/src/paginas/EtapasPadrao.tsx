import { ActionIcon, Button, Group, Modal, Stack, Switch, Table, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconArrowDown, IconArrowUp, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/cliente';
import type { EtapaPadrao } from '../api/tipos';
import { avisarErro, avisarSucesso, Cabecalho, Confirmacao, ErroCarregamento, EstadoVazio, MenuAcoes, Secao, SituacaoAtivo } from '../componentes/comum';
import { useSessao } from '../sessao/sessao';

const CHAVE = ['/etapas-padrao'];

function FormEtapa({ etapa, aoFechar }: { etapa: EtapaPadrao | null; aoFechar: () => void }) {
  const queryClient = useQueryClient();
  const form = useForm({
    initialValues: { nome: etapa?.nome ?? '', ativo: etapa?.ativo ?? true },
    validate: { nome: (v) => (v.trim() ? null : 'Informe o nome da etapa') },
  });
  const salvar = useMutation({
    mutationFn: (v: typeof form.values) =>
      etapa ? api.patch(`/etapas-padrao/${etapa.id}`, { nome: v.nome.trim(), ativo: v.ativo }) : api.post('/etapas-padrao', { nome: v.nome.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHAVE });
      avisarSucesso(etapa ? 'Etapa salva' : 'Etapa incluída no fim da lista');
      aoFechar();
    },
    onError: avisarErro,
  });
  return (
    <form onSubmit={form.onSubmit((v) => salvar.mutate(v))}>
      <Stack>
        <TextInput label="Nome da etapa" maxLength={100} data-autofocus {...form.getInputProps('nome')} />
        {etapa && (
          <Switch
            label="Ativa"
            description="Inativa: continua no cadastro, mas não é copiada para obras novas"
            {...form.getInputProps('ativo', { type: 'checkbox' })}
          />
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={aoFechar}>
            Voltar
          </Button>
          <Button type="submit" loading={salvar.isPending}>
            {etapa ? 'Salvar' : 'Incluir etapa'}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

/** Cadastro das etapas que "Aplicar etapas padrão" copia para uma obra no painel de apontamento. */
export function EtapasPadrao() {
  const { pode } = useSessao();
  const escrever = pode('escreverCadastros');
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<EtapaPadrao | 'nova' | null>(null);
  const [excluindo, setExcluindo] = useState<EtapaPadrao | null>(null);
  const lista = useQuery({ queryKey: CHAVE, queryFn: () => api.get<EtapaPadrao[]>('/etapas-padrao') });

  const reordenar = useMutation({
    mutationFn: (ids: string[]) => api.put<EtapaPadrao[]>('/etapas-padrao/ordem', { ids }),
    onSuccess: (atualizada) => queryClient.setQueryData(CHAVE, atualizada),
    onError: (erro) => {
      avisarErro(erro);
      queryClient.invalidateQueries({ queryKey: CHAVE });
    },
  });
  const excluir = useMutation({
    mutationFn: (e: EtapaPadrao) => api.delete(`/etapas-padrao/${e.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHAVE });
      avisarSucesso('Etapa excluída do modelo; as obras que já a usam não mudam');
    },
    onError: avisarErro,
    onSettled: () => setExcluindo(null),
  });

  const mover = (indice: number, passo: -1 | 1) => {
    const ids = (lista.data ?? []).map((e) => e.id);
    const destino = indice + passo;
    if (destino < 0 || destino >= ids.length) return;
    [ids[indice], ids[destino]] = [ids[destino], ids[indice]];
    reordenar.mutate(ids);
  };

  return (
    <>
      <Cabecalho
        titulo="Etapas padrão"
        descricao="O roteiro copiado para uma obra em Apontamento, ao aplicar as etapas padrão. Cada obra pode mudar as suas depois."
        acoes={
          escrever && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setEditando('nova')}>
              Nova etapa
            </Button>
          )
        }
      />
      <Secao titulo="Ordem das etapas">
        {lista.isError ? (
          <Stack p="md">
            <ErroCarregamento erro={lista.error} aoTentarDeNovo={() => lista.refetch()} />
          </Stack>
        ) : !lista.data ? (
          <Text c="dimmed" size="sm" p="md">
            Carregando...
          </Text>
        ) : lista.data.length === 0 ? (
          <EstadoVazio
            mensagem="Nenhuma etapa padrão. Cadastre o roteiro das obras para aplicá-lo de uma vez em cada uma."
            acao={
              escrever && (
                <Button variant="default" size="xs" leftSection={<IconPlus size={14} />} onClick={() => setEditando('nova')}>
                  Nova etapa
                </Button>
              )
            }
          />
        ) : (
          <Table.ScrollContainer minWidth={420} type="native">
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={60}>Ordem</Table.Th>
                  <Table.Th>Etapa</Table.Th>
                  <Table.Th w={110}>Situação</Table.Th>
                  {escrever && <Table.Th w={130} aria-label="Ações" />}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {lista.data.map((e, i) => (
                  <Table.Tr key={e.id}>
                    <Table.Td>{i + 1}</Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={500} c={e.ativo ? undefined : 'dimmed'}>
                        {e.nome}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <SituacaoAtivo ativo={e.ativo} feminino />
                    </Table.Td>
                    {escrever && (
                      <Table.Td>
                        <Group gap={4} justify="flex-end" wrap="nowrap">
                          <ActionIcon variant="subtle" color="gray" aria-label={`Subir ${e.nome}`} disabled={i === 0 || reordenar.isPending} onClick={() => mover(i, -1)}>
                            <IconArrowUp size={16} />
                          </ActionIcon>
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            aria-label={`Descer ${e.nome}`}
                            disabled={i === lista.data.length - 1 || reordenar.isPending}
                            onClick={() => mover(i, 1)}
                          >
                            <IconArrowDown size={16} />
                          </ActionIcon>
                          <MenuAcoes
                            rotulo={e.nome}
                            itens={[
                              { texto: 'Editar', aoClicar: () => setEditando(e) },
                              { texto: 'Excluir', aoClicar: () => setExcluindo(e), perigosa: true },
                            ]}
                          />
                        </Group>
                      </Table.Td>
                    )}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Secao>

      <Modal opened={editando !== null} onClose={() => setEditando(null)} title={editando === 'nova' ? 'Nova etapa padrão' : 'Editar etapa padrão'}>
        {editando !== null && <FormEtapa etapa={editando === 'nova' ? null : editando} aoFechar={() => setEditando(null)} />}
      </Modal>
      <Confirmacao
        aberta={excluindo !== null}
        titulo="Excluir etapa padrão"
        mensagem={`Excluir "${excluindo?.nome ?? ''}" do modelo? As obras que já têm essa etapa não mudam.`}
        rotuloConfirmar="Excluir"
        perigosa
        carregando={excluir.isPending}
        aoConfirmar={() => excluindo && excluir.mutate(excluindo)}
        aoFechar={() => setExcluindo(null)}
      />
    </>
  );
}

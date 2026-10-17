import { ActionIcon, Badge, Button, Card, Group, Loader, Menu, Modal, Stack, Switch, Table, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconDots, IconPlus, IconSearch } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '../api/cliente';
import type { Pessoa } from '../api/tipos';
import { avisarErro, avisarSucesso, Cabecalho, Confirmacao, ErroCarregamento } from '../componentes/comum';
import { useSessao, type Permissao } from '../sessao/sessao';
import { digitos, documento } from '../util/formato';

export interface ConfigPessoas {
  rota: '/clientes' | '/fornecedores';
  titulo: string;
  singular: string;
  permissaoEscrita: Permissao;
}

export const CLIENTES: ConfigPessoas = { rota: '/clientes', titulo: 'Clientes', singular: 'cliente', permissaoEscrita: 'escreverClientes' };
export const FORNECEDORES: ConfigPessoas = {
  rota: '/fornecedores',
  titulo: 'Fornecedores',
  singular: 'fornecedor',
  permissaoEscrita: 'escreverCadastros',
};

function FormPessoa({ config, pessoa, aoFechar }: { config: ConfigPessoas; pessoa: Pessoa | null; aoFechar: () => void }) {
  const queryClient = useQueryClient();
  const form = useForm({
    initialValues: {
      nome: pessoa?.nome ?? '',
      documento: pessoa ? documento(pessoa.documento) : '',
      email: pessoa?.email ?? '',
      telefone: pessoa?.telefone ?? '',
      ativo: pessoa?.ativo ?? true,
    },
    validate: {
      nome: (v) => (v.trim() ? null : 'Informe o nome'),
      documento: (v) => ([11, 14].includes(digitos(v).length) ? null : 'CPF (11 dígitos) ou CNPJ (14 dígitos)'),
      email: (v) => (!v || /^\S+@\S+\.\S+$/.test(v) ? null : 'E-mail inválido'),
      telefone: (v) => (!v || digitos(v).length >= 8 ? null : 'Telefone incompleto'),
    },
  });
  const salvar = useMutation({
    mutationFn: (v: typeof form.values) => {
      const corpo = {
        nome: v.nome.trim(),
        documento: digitos(v.documento),
        email: v.email.trim() || undefined,
        telefone: digitos(v.telefone) || undefined,
        ativo: v.ativo,
      };
      return pessoa ? api.patch(`${config.rota}/${pessoa.id}`, corpo) : api.post(config.rota, corpo);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [config.rota] });
      avisarSucesso(pessoa ? 'Alterações salvas' : `${config.singular[0].toUpperCase()}${config.singular.slice(1)} cadastrado`);
      aoFechar();
    },
    onError: avisarErro,
  });

  return (
    <form onSubmit={form.onSubmit((v) => salvar.mutate(v))}>
      <Stack>
        <TextInput label="Nome" data-autofocus {...form.getInputProps('nome')} />
        <TextInput label="CPF ou CNPJ" {...form.getInputProps('documento')} />
        <TextInput label="E-mail" type="email" {...form.getInputProps('email')} />
        <TextInput label="Telefone" {...form.getInputProps('telefone')} />
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

export function Pessoas({ config }: { config: ConfigPessoas }) {
  const { pode } = useSessao();
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<Pessoa | 'nova' | null>(null);
  const [removendo, setRemovendo] = useState<Pessoa | null>(null);
  const lista = useQuery({ queryKey: [config.rota], queryFn: () => api.get<Pessoa[]>(config.rota) });

  const remover = useMutation({
    mutationFn: (p: Pessoa) => api.delete(`${config.rota}/${p.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [config.rota] });
      avisarSucesso('Removido');
      setRemovendo(null);
    },
    onError: (erro) => {
      avisarErro(erro);
      setRemovendo(null);
    },
  });

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const termoDigitos = digitos(termo);
    return (lista.data ?? []).filter(
      (p) =>
        !termo ||
        p.nome.toLowerCase().includes(termo) ||
        (termoDigitos && p.documento.includes(termoDigitos)) ||
        p.email?.toLowerCase().includes(termo),
    );
  }, [lista.data, busca]);

  const escrever = pode(config.permissaoEscrita);

  return (
    <>
      <Cabecalho
        titulo={config.titulo}
        acoes={
          escrever && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setEditando('nova')}>
              Novo {config.singular}
            </Button>
          )
        }
      />
      <Card withBorder padding={0}>
        <Group p="md">
          <TextInput
            placeholder="Buscar por nome, documento ou e-mail"
            leftSection={<IconSearch size={16} />}
            value={busca}
            onChange={(e) => setBusca(e.currentTarget.value)}
            w={{ base: '100%', sm: 360 }}
          />
        </Group>
        {lista.isPending ? (
          <Loader m="md" />
        ) : lista.isError ? (
          <ErroCarregamento erro={lista.error} />
        ) : filtradas.length === 0 ? (
          <Text c="dimmed" p="md">
            {busca ? 'Nada encontrado.' : `Nenhum ${config.singular} cadastrado.`}
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={640}>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Nome</Table.Th>
                  <Table.Th>CPF/CNPJ</Table.Th>
                  <Table.Th>E-mail</Table.Th>
                  <Table.Th>Telefone</Table.Th>
                  <Table.Th>Situação</Table.Th>
                  {escrever && <Table.Th w={48} />}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filtradas.map((p) => (
                  <Table.Tr key={p.id}>
                    <Table.Td fw={500}>{p.nome}</Table.Td>
                    <Table.Td>{documento(p.documento)}</Table.Td>
                    <Table.Td>{p.email}</Table.Td>
                    <Table.Td>{p.telefone}</Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={p.ativo ? 'teal' : 'gray'}>
                        {p.ativo ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </Table.Td>
                    {escrever && (
                      <Table.Td>
                        <Menu position="bottom-end">
                          <Menu.Target>
                            <ActionIcon variant="subtle" color="gray" aria-label={`Ações de ${p.nome}`}>
                              <IconDots size={18} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item onClick={() => setEditando(p)}>Editar</Menu.Item>
                            {pode('remover') && (
                              <Menu.Item color="red" onClick={() => setRemovendo(p)}>
                                Remover
                              </Menu.Item>
                            )}
                          </Menu.Dropdown>
                        </Menu>
                      </Table.Td>
                    )}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>

      <Modal
        opened={editando !== null}
        onClose={() => setEditando(null)}
        title={editando === 'nova' ? `Novo ${config.singular}` : `Editar ${config.singular}`}
      >
        {editando !== null && (
          <FormPessoa config={config} pessoa={editando === 'nova' ? null : editando} aoFechar={() => setEditando(null)} />
        )}
      </Modal>
      <Confirmacao
        aberta={removendo !== null}
        titulo={`Remover ${config.singular}`}
        mensagem={`Remover ${removendo?.nome}? Se houver contas ligadas a ele, a remoção é recusada; nesse caso, desative o cadastro.`}
        rotuloConfirmar="Remover"
        perigosa
        carregando={remover.isPending}
        aoConfirmar={() => removendo && remover.mutate(removendo)}
        aoFechar={() => setRemovendo(null)}
      />
    </>
  );
}

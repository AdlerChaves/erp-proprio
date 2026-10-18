import { Badge, Button, Card, Group, Loader, Modal, PasswordInput, Select, Stack, Table, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/cliente';
import type { Perfil, UsuarioDaEmpresa } from '../api/tipos';
import { avisarErro, avisarSucesso, Cabecalho, Confirmacao, ErroCarregamento, MenuAcoes, SemPermissao, SituacaoAtivo } from '../componentes/comum';
import { useSessao } from '../sessao/sessao';

export const PERFIS: { value: Perfil; label: string; descricao: string }[] = [
  { value: 'ADMIN', label: 'Administrador', descricao: 'Tudo, inclusive usuários, auditoria e remoções' },
  { value: 'FINANCEIRO', label: 'Financeiro', descricao: 'Contas, baixas, extrato, relatórios e cadastros' },
  { value: 'VENDAS', label: 'Vendas', descricao: 'Clientes e produtos; não vê saldos nem contas' },
  { value: 'CONSULTA', label: 'Consulta', descricao: 'Vê tudo do financeiro, sem alterar nada' },
];
const rotuloPerfil = (perfil: Perfil) => PERFIS.find((p) => p.value === perfil)?.label ?? perfil;
const opcoesPerfil = PERFIS.map((p) => ({ value: p.value, label: `${p.label} — ${p.descricao}` }));

function FormNovo({ aoFechar }: { aoFechar: () => void }) {
  const queryClient = useQueryClient();
  const form = useForm({
    initialValues: { email: '', perfil: 'FINANCEIRO' as Perfil, nome: '', senha: '' },
    validate: {
      email: (v) => (/^\S+@\S+\.\S+$/.test(v.trim()) ? null : 'Informe um e-mail válido'),
      senha: (v) => (!v || v.length >= 8 ? null : 'Pelo menos 8 caracteres'),
    },
  });
  const salvar = useMutation({
    mutationFn: (v: typeof form.values) =>
      api.post('/usuarios', { email: v.email.trim(), perfil: v.perfil, nome: v.nome.trim() || undefined, senha: v.senha || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/usuarios'] });
      avisarSucesso('Acesso concedido');
      aoFechar();
    },
    onError: avisarErro,
  });

  return (
    <form onSubmit={form.onSubmit((v) => salvar.mutate(v))}>
      <Stack>
        <TextInput label="E-mail" type="email" data-autofocus {...form.getInputProps('email')} />
        <Select label="Perfil" data={opcoesPerfil} allowDeselect={false} {...form.getInputProps('perfil')} />
        <Text size="sm" c="dimmed">
          Se a pessoa ainda não usa o sistema, informe também o nome e uma senha inicial e entregue-os a ela. Se ela já tem conta (em
          outra empresa), deixe em branco: o acesso é somado ao que ela já tem.
        </Text>
        <TextInput label="Nome" {...form.getInputProps('nome')} />
        <PasswordInput label="Senha inicial" description="Mínimo de 8 caracteres; evite senhas óbvias" autoComplete="new-password" {...form.getInputProps('senha')} />
        <Group justify="flex-end">
          <Button variant="default" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" loading={salvar.isPending}>
            Conceder acesso
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

function FormPerfil({ usuario, aoFechar }: { usuario: UsuarioDaEmpresa; aoFechar: () => void }) {
  const queryClient = useQueryClient();
  const { me, atualizar } = useSessao();
  const euMesmo = usuario.id === me?.usuario.id;
  const [perfil, setPerfil] = useState<Perfil>(usuario.perfil);
  const salvar = useMutation({
    mutationFn: () => api.patch(`/usuarios/${usuario.id}`, { perfil }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/usuarios'] });
      avisarSucesso('Perfil alterado');
      aoFechar();
      // Quem tira o próprio perfil de administrador perde esta tela.
      if (euMesmo) atualizar();
    },
    onError: avisarErro,
  });
  return (
    <Stack>
      <Text size="sm">
        {usuario.nome} · {usuario.email}
      </Text>
      <Select label="Perfil" data={opcoesPerfil} value={perfil} onChange={(v) => v && setPerfil(v as Perfil)} allowDeselect={false} />
      <Text size="xs" c={euMesmo && perfil !== 'ADMIN' ? 'orange.8' : 'dimmed'}>
        {euMesmo && perfil !== 'ADMIN'
          ? 'Você está tirando o seu próprio acesso de administrador: deixará de ver usuários e auditoria.'
          : 'A mudança vale na próxima requisição da pessoa, sem precisar sair e entrar de novo.'}
      </Text>
      <Group justify="flex-end">
        <Button variant="default" onClick={aoFechar}>
          Cancelar
        </Button>
        <Button loading={salvar.isPending} onClick={() => salvar.mutate()} disabled={perfil === usuario.perfil}>
          Salvar
        </Button>
      </Group>
    </Stack>
  );
}

export function Usuarios() {
  const { me, pode } = useSessao();
  const queryClient = useQueryClient();
  const [novo, setNovo] = useState(false);
  const [editando, setEditando] = useState<UsuarioDaEmpresa | null>(null);
  const [alternando, setAlternando] = useState<UsuarioDaEmpresa | null>(null);
  const lista = useQuery({ queryKey: ['/usuarios'], queryFn: () => api.get<UsuarioDaEmpresa[]>('/usuarios'), enabled: pode('administrar') });

  const alternar = useMutation({
    mutationFn: (u: UsuarioDaEmpresa) => api.patch(`/usuarios/${u.id}`, { ativo: !u.ativo }),
    onSuccess: (_, u) => {
      queryClient.invalidateQueries({ queryKey: ['/usuarios'] });
      avisarSucesso(u.ativo ? 'Acesso suspenso' : 'Acesso reativado');
    },
    onError: avisarErro,
    onSettled: () => setAlternando(null),
  });

  if (!pode('administrar')) return <SemPermissao titulo="Usuários" />;
  return (
    <>
      <Cabecalho
        titulo="Usuários"
        descricao="Quem acessa esta empresa e com qual perfil"
        acoes={
          <Button leftSection={<IconPlus size={16} />} onClick={() => setNovo(true)}>
            Conceder acesso
          </Button>
        }
      />
      <Card withBorder padding={0}>
        {lista.isPending ? (
          <Loader m="md" />
        ) : lista.isError ? (
          <ErroCarregamento erro={lista.error} />
        ) : (
          <Table.ScrollContainer minWidth={600}>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Nome</Table.Th>
                  <Table.Th>E-mail</Table.Th>
                  <Table.Th>Perfil</Table.Th>
                  <Table.Th w={110}>Situação</Table.Th>
                  <Table.Th w={48} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {lista.data.map((u) => {
                  const euMesmo = u.id === me?.usuario.id;
                  return (
                    <Table.Tr key={u.id} c={u.ativo ? undefined : 'dimmed'}>
                      <Table.Td fw={500}>
                        {u.nome}
                        {euMesmo && (
                          <Badge size="xs" variant="outline" ml={6}>
                            você
                          </Badge>
                        )}
                      </Table.Td>
                      <Table.Td>{u.email}</Table.Td>
                      <Table.Td>{rotuloPerfil(u.perfil)}</Table.Td>
                      <Table.Td>
                        <SituacaoAtivo ativo={u.ativo} />
                      </Table.Td>
                      <Table.Td>
                        <MenuAcoes
                          rotulo={u.nome}
                          itens={[
                            { texto: 'Alterar perfil', aoClicar: () => setEditando(u) },
                            !euMesmo && { texto: u.ativo ? 'Suspender acesso' : 'Reativar acesso', aoClicar: () => setAlternando(u), perigosa: u.ativo },
                          ]}
                        />
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>
      <Modal opened={novo} onClose={() => setNovo(false)} title="Conceder acesso" size="lg">
        {novo && <FormNovo aoFechar={() => setNovo(false)} />}
      </Modal>
      <Modal opened={editando !== null} onClose={() => setEditando(null)} title="Alterar perfil" size="lg">
        {editando && <FormPerfil usuario={editando} aoFechar={() => setEditando(null)} />}
      </Modal>
      <Confirmacao
        aberta={alternando !== null}
        titulo={alternando?.ativo ? 'Suspender acesso' : 'Reativar acesso'}
        mensagem={
          alternando?.ativo
            ? `${alternando.nome} deixa de acessar esta empresa imediatamente, inclusive em sessões já abertas. O acesso a outras empresas não muda.`
            : `${alternando?.nome} volta a acessar esta empresa com o perfil ${alternando ? rotuloPerfil(alternando.perfil) : ''}.`
        }
        rotuloConfirmar={alternando?.ativo ? 'Suspender' : 'Reativar'}
        perigosa={alternando?.ativo}
        carregando={alternar.isPending}
        aoConfirmar={() => alternando && alternar.mutate(alternando)}
        aoFechar={() => setAlternando(null)}
      />
    </>
  );
}

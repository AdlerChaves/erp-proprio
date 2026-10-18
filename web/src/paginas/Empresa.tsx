import { Badge, Button, Card, Group, Loader, Modal, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/cliente';
import type { Empresa as DadosEmpresa } from '../api/tipos';
import { avisarErro, avisarSucesso, Cabecalho, ErroCarregamento } from '../componentes/comum';
import { useSessao } from '../sessao/sessao';
import { digitos, documento } from '../util/formato';
import { PERFIS } from './Usuarios';

function FormDados({ empresa, podeEditar }: { empresa: DadosEmpresa; podeEditar: boolean }) {
  const queryClient = useQueryClient();
  const { atualizar } = useSessao();
  const form = useForm({
    initialValues: { razaoSocial: empresa.razaoSocial, nomeFantasia: empresa.nomeFantasia ?? '' },
    validate: { razaoSocial: (v) => (v.trim() ? null : 'Informe a razão social') },
  });
  const salvar = useMutation({
    mutationFn: (v: typeof form.values) =>
      api.patch<DadosEmpresa>('/empresas/atual', { razaoSocial: v.razaoSocial.trim(), nomeFantasia: v.nomeFantasia.trim() || null }),
    onSuccess: (atualizada) => {
      queryClient.setQueryData(['/empresas/atual'], atualizada);
      form.resetDirty({ razaoSocial: atualizada.razaoSocial, nomeFantasia: atualizada.nomeFantasia ?? '' });
      // O nome aparece no topo da tela, que vem da sessão.
      atualizar();
      avisarSucesso('Dados da empresa salvos');
    },
    onError: avisarErro,
  });

  return (
    <form onSubmit={form.onSubmit((v) => salvar.mutate(v))}>
      <Stack>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label="Razão social" disabled={!podeEditar} {...form.getInputProps('razaoSocial')} />
          <TextInput label="Nome fantasia" description="Aparece no topo da tela" disabled={!podeEditar} {...form.getInputProps('nomeFantasia')} />
          <TextInput label="CNPJ" value={documento(empresa.cnpj)} disabled description="Não pode ser alterado" readOnly />
        </SimpleGrid>
        {podeEditar && (
          <Group justify="flex-end">
            <Button type="submit" loading={salvar.isPending} disabled={!form.isDirty()}>
              Salvar
            </Button>
          </Group>
        )}
      </Stack>
    </form>
  );
}

function FormNovaEmpresa({ aoFechar }: { aoFechar: () => void }) {
  const { atualizar, trocarEmpresa } = useSessao();
  const navegar = useNavigate();
  const form = useForm({
    initialValues: { razaoSocial: '', nomeFantasia: '', cnpj: '' },
    validate: {
      razaoSocial: (v) => (v.trim() ? null : 'Informe a razão social'),
      cnpj: (v) => (digitos(v).length === 14 ? null : 'O CNPJ tem 14 dígitos'),
    },
  });
  const criar = useMutation({
    mutationFn: (v: typeof form.values) =>
      api.post<DadosEmpresa>('/empresas', { razaoSocial: v.razaoSocial.trim(), nomeFantasia: v.nomeFantasia.trim() || undefined, cnpj: digitos(v.cnpj) }),
    onSuccess: async (empresa) => {
      avisarSucesso(`${empresa.nomeFantasia || empresa.razaoSocial} criada; você é o administrador`);
      aoFechar();
      await atualizar();
      await trocarEmpresa(empresa.id);
      navegar('/');
    },
    onError: avisarErro,
  });

  return (
    <form onSubmit={form.onSubmit((v) => criar.mutate(v))}>
      <Stack>
        <Text size="sm" c="dimmed">
          A nova empresa começa com o plano de contas padrão e com você como administrador. Os dados de cada empresa ficam separados.
        </Text>
        <TextInput label="Razão social" data-autofocus {...form.getInputProps('razaoSocial')} />
        <TextInput label="Nome fantasia" description="Opcional" {...form.getInputProps('nomeFantasia')} />
        <TextInput label="CNPJ" placeholder="00.000.000/0000-00" {...form.getInputProps('cnpj')} />
        <Group justify="flex-end">
          <Button variant="default" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" loading={criar.isPending}>
            Criar e acessar
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

export function Empresa() {
  const { me, pode, trocarEmpresa } = useSessao();
  const navegar = useNavigate();
  const [nova, setNova] = useState(false);
  const empresa = useQuery({ queryKey: ['/empresas/atual'], queryFn: () => api.get<DadosEmpresa>('/empresas/atual') });

  const acessar = async (id: string) => {
    try {
      await trocarEmpresa(id);
      navegar('/');
    } catch (erro) {
      avisarErro(erro);
    }
  };

  return (
    <>
      <Cabecalho
        titulo="Empresa"
        acoes={
          <Button variant="default" leftSection={<IconPlus size={16} />} onClick={() => setNova(true)}>
            Nova empresa
          </Button>
        }
      />
      <Stack>
        <Card withBorder padding="lg">
          <Title order={4} mb="md">
            Dados da empresa atual
          </Title>
          {empresa.isPending ? (
            <Loader />
          ) : empresa.isError ? (
            <ErroCarregamento erro={empresa.error} />
          ) : (
            <FormDados key={empresa.data.id} empresa={empresa.data} podeEditar={pode('administrar')} />
          )}
        </Card>

        <Card withBorder padding={0}>
          <Title order={4} p="lg" pb="xs">
            Suas empresas
          </Title>
          <Table verticalSpacing="sm">
            <Table.Tbody>
              {me?.empresas.map((e) => (
                <Table.Tr key={e.id}>
                  <Table.Td pl="lg">
                    <Text size="sm" fw={500}>
                      {e.nomeFantasia || e.razaoSocial}
                    </Text>
                    {e.nomeFantasia && (
                      <Text size="xs" c="dimmed">
                        {e.razaoSocial}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{PERFIS.find((p) => p.value === e.perfil)?.label}</Text>
                  </Table.Td>
                  <Table.Td ta="right" pr="lg">
                    {e.id === me.empresaId ? (
                      <Badge variant="light">Atual</Badge>
                    ) : (
                      <Button size="compact-sm" variant="light" onClick={() => acessar(e.id)}>
                        Acessar
                      </Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      </Stack>
      <Modal opened={nova} onClose={() => setNova(false)} title="Nova empresa">
        {nova && <FormNovaEmpresa aoFechar={() => setNova(false)} />}
      </Modal>
    </>
  );
}

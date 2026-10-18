import { Alert, Badge, Button, Card, Group, Loader, Modal, NumberInput, SegmentedControl, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/cliente';
import type { Empresa as DadosEmpresa, RegimeTributario } from '../api/tipos';
import { avisarErro, avisarSucesso, Cabecalho, ErroCarregamento } from '../componentes/comum';
import { CampoMunicipio } from '../componentes/Fiscal';
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

const REGIMES: { value: RegimeTributario; label: string }[] = [
  { value: 'SIMPLES_NACIONAL', label: 'Simples Nacional (ME/EPP)' },
  { value: 'MEI', label: 'MEI' },
  { value: 'LUCRO_PRESUMIDO', label: 'Lucro Presumido' },
  { value: 'LUCRO_REAL', label: 'Lucro Real' },
];

const APURACAO = [
  { value: '1', label: 'Tributos federais e ISS pelo Simples (padrão)' },
  { value: '2', label: 'Federais pelo Simples; ISS pela prefeitura' },
  { value: '3', label: 'Tudo fora do Simples (sublimite ultrapassado)' },
];

/** Dados que vão na nota de serviço (DPS). */
function FormFiscal({ empresa, podeEditar }: { empresa: DadosEmpresa; podeEditar: boolean }) {
  const queryClient = useQueryClient();
  const valoresDe = (e: DadosEmpresa) => ({
    inscricaoMunicipal: e.inscricaoMunicipal ?? '',
    codigoMunicipio: e.codigoMunicipio,
    regimeTributario: e.regimeTributario,
    regimeApuracaoSimples: String(e.regimeApuracaoSimples),
    aliquotaSimples: e.aliquotaSimples ?? ('' as number | ''),
    nfseSerie: e.nfseSerie,
    nfseAmbiente: String(e.nfseAmbiente),
  });
  const form = useForm({
    initialValues: valoresDe(empresa),
    validate: {
      nfseSerie: (v) => (/^\d{1,5}$/.test(v) && Number(v) >= 1 && Number(v) <= 49999 ? null : 'De 1 a 49999'),
      aliquotaSimples: (v, c) =>
        c.regimeTributario !== 'SIMPLES_NACIONAL' || v === '' || (Number(v) > 0 && Number(v) < 100) ? null : 'Entre 0 e 100%',
    },
  });
  const simples = form.values.regimeTributario === 'SIMPLES_NACIONAL';
  const salvar = useMutation({
    mutationFn: (v: typeof form.values) =>
      api.patch<DadosEmpresa>('/empresas/atual', {
        inscricaoMunicipal: v.inscricaoMunicipal.trim() || null,
        codigoMunicipio: v.codigoMunicipio,
        regimeTributario: v.regimeTributario,
        regimeApuracaoSimples: Number(v.regimeApuracaoSimples),
        aliquotaSimples: v.aliquotaSimples === '' ? null : Number(v.aliquotaSimples),
        nfseSerie: v.nfseSerie,
        nfseAmbiente: Number(v.nfseAmbiente),
      }),
    onSuccess: (atualizada) => {
      queryClient.setQueryData(['/empresas/atual'], atualizada);
      form.resetDirty(valoresDe(atualizada));
      avisarSucesso('Dados fiscais salvos');
    },
    onError: avisarErro,
  });

  return (
    <form onSubmit={form.onSubmit((v) => salvar.mutate(v))}>
      <Stack>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select label="Regime tributário" data={REGIMES} disabled={!podeEditar} {...form.getInputProps('regimeTributario')} />
          <TextInput label="Inscrição municipal" disabled={!podeEditar} {...form.getInputProps('inscricaoMunicipal')} />
          <CampoMunicipio label="Município do cadastro" description="É o município emissor da nota" disabled={!podeEditar} {...form.getInputProps('codigoMunicipio')} />
          {simples && (
            <NumberInput
              label="Tributos aproximados do Simples (%)"
              description="Alíquota efetiva da sua faixa; vai na nota como total aproximado de tributos"
              decimalSeparator=","
              decimalScale={2}
              suffix=" %"
              hideControls
              disabled={!podeEditar}
              {...form.getInputProps('aliquotaSimples')}
            />
          )}
          {simples && (
            <Select label="Apuração no Simples" data={APURACAO} allowDeselect={false} disabled={!podeEditar} {...form.getInputProps('regimeApuracaoSimples')} />
          )}
          <TextInput label="Série da DPS" description="De 1 a 49999" disabled={!podeEditar} {...form.getInputProps('nfseSerie')} />
        </SimpleGrid>
        <div>
          <Text size="sm" fw={500} mb={4}>
            Ambiente
          </Text>
          <SegmentedControl
            disabled={!podeEditar}
            data={[
              { value: '2', label: 'Homologação (testes)' },
              { value: '1', label: 'Produção' },
            ]}
            {...form.getInputProps('nfseAmbiente')}
          />
          <Text size="xs" c="dimmed" mt={4}>
            Vale para o envio automático, quando ele for ligado. Hoje a nota é emitida no portal da prefeitura.
          </Text>
        </div>
        {form.values.regimeTributario && !simples && form.values.regimeTributario !== 'MEI' && (
          <Alert color="yellow">Por enquanto, o ERP só gera notas de serviço para empresas do Simples Nacional e MEI.</Alert>
        )}
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

        <Card withBorder padding="lg">
          <Title order={4}>Dados fiscais</Title>
          <Text size="sm" c="dimmed" mb="md">
            Usados na nota fiscal de serviço
          </Text>
          {empresa.data && <FormFiscal key={empresa.data.id} empresa={empresa.data} podeEditar={pode('administrar')} />}
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

import {
  Alert,
  Badge,
  Button,
  Card,
  FileInput,
  Grid,
  Group,
  Loader,
  Modal,
  NumberInput,
  PasswordInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/cliente';
import type { DadosCep, Empresa as DadosEmpresa, RegimeTributario } from '../api/tipos';
import { avisarErro, avisarSucesso, Cabecalho, Confirmacao, ErroCarregamento } from '../componentes/comum';
import { CampoCep, enderecoDoCep } from '../componentes/Cep';
import { BotaoBuscarCnpj, ResumoCnpj, useBuscaCnpj } from '../componentes/Cnpj';
import { CampoMunicipio } from '../componentes/Fiscal';
import { useSessao } from '../sessao/sessao';
import { lerComoBase64 } from '../util/arquivo';
import { digitos, documento, documentoValido } from '../util/formato';
import { FormProposta } from './EmpresaProposta';
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

const cepFormatado = (cep: string) => cep.replace(/(\d{5})(\d{3})/, '$1-$2');

/** Algum campo de endereço preenchido. */
const temEndereco = (c: { cep: string; logradouro: string; numero: string; bairro: string; codigoMunicipio: string | null }) =>
  !!(digitos(c.cep) || c.logradouro.trim() || c.numero.trim() || c.bairro.trim() || c.codigoMunicipio);

/** Telefone, e-mail e endereço: vão no cabeçalho dos orçamentos e pedidos em PDF. */
function FormContato({ empresa, podeEditar }: { empresa: DadosEmpresa; podeEditar: boolean }) {
  const queryClient = useQueryClient();
  const valoresDe = (e: DadosEmpresa) => ({
    telefone: e.telefone ?? '',
    email: e.email ?? '',
    cep: e.endereco ? cepFormatado(e.endereco.cep) : '',
    logradouro: e.endereco?.logradouro ?? '',
    numero: e.endereco?.numero ?? '',
    complemento: e.endereco?.complemento ?? '',
    bairro: e.endereco?.bairro ?? '',
    codigoMunicipio: e.endereco?.codigoMunicipio ?? e.codigoMunicipio ?? (null as string | null),
  });
  const form = useForm({
    initialValues: valoresDe(empresa),
    validate: {
      email: (v) => (!v || /^\S+@\S+\.\S+$/.test(v) ? null : 'E-mail inválido'),
      telefone: (v) => (!v || digitos(v).length >= 8 ? null : 'Telefone incompleto'),
      // O endereço é opcional, mas, se começar a preencher, precisa ficar completo.
      cep: (v, c) => (!temEndereco(c) || digitos(v).length === 8 ? null : 'CEP com 8 dígitos'),
      logradouro: (v, c) => (!temEndereco(c) || v.trim() ? null : 'Informe a rua'),
      numero: (v, c) => (!temEndereco(c) || v.trim() ? null : 'Informe o número (ou S/N)'),
      bairro: (v, c) => (!temEndereco(c) || v.trim() ? null : 'Informe o bairro'),
      codigoMunicipio: (v, c) => (!temEndereco(c) || v ? null : 'Escolha o município'),
    },
  });
  // Campos que a Receita não informa continuam como estavam.
  const receita = useBuscaCnpj((d) => {
    const atual = form.values;
    const ou = (novo: string | null | undefined, antigo: string) => novo || antigo;
    form.setValues({
      telefone: ou(d.telefone, atual.telefone),
      email: ou(d.email?.toLowerCase(), atual.email),
      cep: ou(d.endereco.cep && cepFormatado(d.endereco.cep), atual.cep),
      logradouro: ou(d.endereco.logradouro, atual.logradouro),
      numero: ou(d.endereco.numero, atual.numero),
      complemento: ou(d.endereco.complemento, atual.complemento),
      bairro: ou(d.endereco.bairro, atual.bairro),
      codigoMunicipio: d.endereco.codigoMunicipio ?? atual.codigoMunicipio,
    });
    avisarSucesso('Contato e endereço preenchidos pela Receita; confira e salve');
  });
  const numero = useRef<HTMLInputElement>(null);
  const preencherCep = (d: DadosCep) => {
    form.setValues(enderecoDoCep(d, form.values));
    if (d.logradouro) numero.current?.focus();
  };
  const salvar = useMutation({
    mutationFn: (v: typeof form.values) =>
      api.patch<DadosEmpresa>('/empresas/atual', {
        telefone: digitos(v.telefone) || null,
        email: v.email.trim() || null,
        endereco: temEndereco(v)
          ? {
              cep: digitos(v.cep),
              logradouro: v.logradouro.trim(),
              numero: v.numero.trim(),
              complemento: v.complemento.trim() || undefined,
              bairro: v.bairro.trim(),
              codigoMunicipio: v.codigoMunicipio,
            }
          : null,
      }),
    onSuccess: (atualizada) => {
      queryClient.setQueryData(['/empresas/atual'], atualizada);
      form.resetDirty(valoresDe(atualizada));
      avisarSucesso('Contato e endereço salvos');
    },
    onError: avisarErro,
  });

  return (
    <form onSubmit={form.onSubmit((v) => salvar.mutate(v))}>
      <Stack>
        {podeEditar && (
          <Group>
            <Button size="xs" variant="light" loading={receita.buscando} onClick={() => receita.buscar(empresa.cnpj)}>
              Preencher pela Receita Federal
            </Button>
            <Text size="xs" c="dimmed">
              Traz telefone, e-mail e endereço do cadastro do CNPJ
            </Text>
          </Group>
        )}
        <Grid>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Telefone" disabled={!podeEditar} {...form.getInputProps('telefone')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="E-mail" type="email" disabled={!podeEditar} {...form.getInputProps('email')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <CampoCep label="CEP" disabled={!podeEditar} {...form.getInputProps('cep')} aoEncontrar={preencherCep} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 8 }}>
            <CampoMunicipio label="Município" disabled={!podeEditar} {...form.getInputProps('codigoMunicipio')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 8 }}>
            <TextInput label="Rua" disabled={!podeEditar} {...form.getInputProps('logradouro')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <TextInput label="Número" ref={numero} disabled={!podeEditar} {...form.getInputProps('numero')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Complemento" disabled={!podeEditar} {...form.getInputProps('complemento')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Bairro" disabled={!podeEditar} {...form.getInputProps('bairro')} />
          </Grid.Col>
        </Grid>
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

/** A partir de qual número orçamentos e vendas são numerados. */
function FormNumeracao({ empresa, podeEditar }: { empresa: DadosEmpresa; podeEditar: boolean }) {
  const queryClient = useQueryClient();
  const form = useForm({
    initialValues: { numeroInicialVendas: empresa.numeroInicialVendas as number | '' },
    validate: {
      numeroInicialVendas: (v) => (v !== '' && Number.isInteger(v) && v >= 1 && v <= 999_999_999 ? null : 'Um número inteiro a partir de 1'),
    },
  });
  const salvar = useMutation({
    mutationFn: (v: typeof form.values) => api.patch<DadosEmpresa>('/empresas/atual', { numeroInicialVendas: Number(v.numeroInicialVendas) }),
    onSuccess: (atualizada) => {
      queryClient.setQueryData(['/empresas/atual'], atualizada);
      form.resetDirty({ numeroInicialVendas: atualizada.numeroInicialVendas });
      avisarSucesso('Numeração salva: vale para os próximos orçamentos');
    },
    onError: avisarErro,
  });

  return (
    <form onSubmit={form.onSubmit((v) => salvar.mutate(v))}>
      <Group align="flex-end">
        <NumberInput
          label="Primeiro número de orçamentos e vendas"
          description="Os próximos orçamentos seguem a partir dele; se já houver um número maior em uso, continuam a partir desse"
          allowDecimal={false}
          allowNegative={false}
          thousandSeparator="."
          decimalSeparator=","
          min={1}
          w={{ base: '100%', sm: 420 }}
          disabled={!podeEditar}
          {...form.getInputProps('numeroInicialVendas')}
        />
        {podeEditar && (
          <Button type="submit" loading={salvar.isPending} disabled={!form.isDirty()}>
            Salvar
          </Button>
        )}
      </Group>
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
  // Município e regime pela Receita; o percentual do Simples e a inscrição municipal ela não informa.
  const receita = useBuscaCnpj((d) => {
    const regime: RegimeTributario | null = d.mei ? 'MEI' : d.simplesNacional ? 'SIMPLES_NACIONAL' : null;
    form.setValues({
      codigoMunicipio: d.endereco.codigoMunicipio ?? form.values.codigoMunicipio,
      regimeTributario: regime ?? form.values.regimeTributario,
    });
    const preenchidos = [d.endereco.codigoMunicipio && 'município', regime && 'regime'].filter(Boolean);
    avisarSucesso(
      preenchidos.length
        ? `${preenchidos.join(' e ')} preenchido${preenchidos.length > 1 ? 's' : ''} pela Receita; confira e salve`.replace(/^./, (l) => l.toUpperCase())
        : 'A Receita não informou município nem opção pelo Simples para este CNPJ',
    );
    if (!regime && d.endereco.codigoMunicipio) avisarSucesso('A Receita não indica Simples nem MEI para este CNPJ; escolha o regime manualmente');
  });
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
        {podeEditar && (
          <Group>
            <Button size="xs" variant="light" loading={receita.buscando} onClick={() => receita.buscar(empresa.cnpj)}>
              Preencher pela Receita Federal
            </Button>
            <Text size="xs" c="dimmed">
              Traz o município e se a empresa é do Simples ou MEI, pelo CNPJ {documento(empresa.cnpj)}
            </Text>
          </Group>
        )}
        {receita.dados && !receita.dados.ativa && <ResumoCnpj dados={receita.dados} propria />}
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
            Em homologação, a nota vai para o ambiente de testes do Emissor Nacional e não tem valor fiscal. Em produção, a nota é
            real.
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

/** Certificado digital A1 (e-CNPJ) que assina e transmite a nota de serviço ao Emissor Nacional. */
function FormCertificado({ empresa, podeEditar }: { empresa: DadosEmpresa; podeEditar: boolean }) {
  const queryClient = useQueryClient();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [senha, setSenha] = useState('');
  const [removendo, setRemovendo] = useState(false);
  const atualizar = (atualizada: DadosEmpresa) => queryClient.setQueryData(['/empresas/atual'], atualizada);
  const instalar = useMutation({
    mutationFn: async () => {
      if (!arquivo) throw new Error('Escolha o arquivo do certificado (.pfx ou .p12)');
      if (arquivo.size > 64 * 1024) throw new Error('O arquivo é grande demais para um certificado A1');
      return api.put<DadosEmpresa>('/empresas/atual/certificado', { certificado: await lerComoBase64(arquivo), senha });
    },
    onSuccess: (atualizada) => {
      atualizar(atualizada);
      setArquivo(null);
      setSenha('');
      avisarSucesso('Certificado instalado');
    },
    onError: avisarErro,
  });
  const remover = useMutation({
    mutationFn: () => api.delete('/empresas/atual/certificado'),
    onSuccess: () => {
      atualizar({ ...empresa, certificadoTitular: null, certificadoValidade: null });
      setRemovendo(false);
      avisarSucesso('Certificado removido');
    },
    onError: avisarErro,
  });

  const validade = empresa.certificadoValidade ? new Date(empresa.certificadoValidade) : null;
  const dias = validade ? Math.floor((validade.getTime() - Date.now()) / 86_400_000) : null;
  return (
    <Stack>
      {validade && dias !== null ? (
        <Group justify="space-between" wrap="nowrap">
          <div>
            <Text size="sm" fw={500}>
              {empresa.certificadoTitular}
            </Text>
            <Text size="xs" c="dimmed">
              Válido até {validade.toLocaleDateString('pt-BR')}
            </Text>
          </div>
          <Group gap="xs" wrap="nowrap">
            <Badge variant="light" color={dias < 0 ? 'red' : dias <= 30 ? 'orange' : 'teal'}>
              {dias < 0 ? 'Vencido' : dias <= 30 ? `Vence em ${dias} dia${dias === 1 ? '' : 's'}` : 'Instalado'}
            </Badge>
            {podeEditar && (
              <Button size="xs" variant="subtle" color="red" onClick={() => setRemovendo(true)}>
                Remover
              </Button>
            )}
          </Group>
        </Group>
      ) : (
        <Alert color="yellow">Sem certificado, as notas não são transmitidas pelo ERP: só dá para registrar notas emitidas fora dele.</Alert>
      )}
      {podeEditar && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            instalar.mutate();
          }}
        >
          <Group align="flex-end">
            <FileInput
              label={validade ? 'Trocar pelo certificado novo' : 'Arquivo do certificado A1'}
              placeholder=".pfx ou .p12"
              accept=".pfx,.p12,application/x-pkcs12"
              clearable
              value={arquivo}
              onChange={setArquivo}
              w={260}
            />
            <PasswordInput label="Senha do certificado" value={senha} onChange={(e) => setSenha(e.currentTarget.value)} w={220} />
            <Button type="submit" loading={instalar.isPending} disabled={!arquivo || !senha}>
              Instalar
            </Button>
          </Group>
          <Text size="xs" c="dimmed" mt="xs">
            O ERP confere se o certificado é desta empresa e se está no prazo, e o guarda criptografado. Ele nunca volta para o navegador.
          </Text>
        </form>
      )}
      <Confirmacao
        aberta={removendo}
        titulo="Remover certificado"
        mensagem="O ERP deixa de transmitir notas até um certificado novo ser instalado."
        rotuloConfirmar="Remover"
        perigosa
        carregando={remover.isPending}
        aoConfirmar={() => remover.mutate()}
        aoFechar={() => setRemovendo(false)}
      />
    </Stack>
  );
}

function FormNovaEmpresa({ aoFechar }: { aoFechar: () => void }) {
  const { atualizar, trocarEmpresa } = useSessao();
  const navegar = useNavigate();
  const form = useForm({
    initialValues: { razaoSocial: '', nomeFantasia: '', cnpj: '' },
    validate: {
      razaoSocial: (v) => (v.trim() ? null : 'Informe a razão social'),
      cnpj: (v) => (digitos(v).length !== 14 ? 'O CNPJ tem 14 dígitos' : documentoValido(v) ? null : 'CNPJ com dígito verificador errado'),
    },
  });
  const cnpj = useBuscaCnpj((d) => form.setValues({ razaoSocial: d.razaoSocial, nomeFantasia: d.nomeFantasia ?? '' }));
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
        <TextInput
          label="CNPJ"
          placeholder="00.000.000/0000-00"
          description="Com um CNPJ válido, a razão social vem da Receita Federal"
          data-autofocus
          {...form.getInputProps('cnpj')}
          onChange={(e) => {
            form.getInputProps('cnpj').onChange(e);
            cnpj.automatico(e.currentTarget.value);
          }}
          rightSection={<BotaoBuscarCnpj cnpj={form.values.cnpj} buscando={cnpj.buscando} aoClicar={() => cnpj.buscar(form.values.cnpj)} />}
        />
        {cnpj.dados && digitos(form.values.cnpj) === cnpj.dados.cnpj && <ResumoCnpj dados={cnpj.dados} />}
        <TextInput label="Razão social" {...form.getInputProps('razaoSocial')} />
        <TextInput label="Nome fantasia" description="Opcional" {...form.getInputProps('nomeFantasia')} />
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
          <Title order={4}>Contato e endereço</Title>
          <Text size="sm" c="dimmed" mb="md">
            Aparecem no cabeçalho dos orçamentos e pedidos em PDF
          </Text>
          {empresa.data && <FormContato key={empresa.data.id} empresa={empresa.data} podeEditar={pode('administrar')} />}
        </Card>

        <Card withBorder padding="lg">
          <Title order={4}>Orçamento em PDF</Title>
          <Text size="sm" c="dimmed" mb="md">
            Logo, destaques, validade, condições e a tabela de parcelamento no cartão que aparecem nos orçamentos
          </Text>
          {empresa.data && <FormProposta key={empresa.data.id} empresa={empresa.data} podeEditar={pode('administrar')} />}
        </Card>

        <Card withBorder padding="lg">
          <Title order={4}>Numeração</Title>
          <Text size="sm" c="dimmed" mb="md">
            O mesmo número acompanha o orçamento quando ele vira pedido e venda. Números já usados não mudam.
          </Text>
          {empresa.data && <FormNumeracao key={empresa.data.id} empresa={empresa.data} podeEditar={pode('administrar')} />}
        </Card>

        <Card withBorder padding="lg">
          <Title order={4}>Dados fiscais</Title>
          <Text size="sm" c="dimmed" mb="md">
            Usados na nota fiscal de serviço
          </Text>
          {empresa.data && <FormFiscal key={empresa.data.id} empresa={empresa.data} podeEditar={pode('administrar')} />}
        </Card>

        <Card withBorder padding="lg">
          <Title order={4}>Certificado digital</Title>
          <Text size="sm" c="dimmed" mb="md">
            Certificado A1 (e-CNPJ) que assina e transmite as notas de serviço ao Emissor Nacional
          </Text>
          {empresa.data && <FormCertificado key={empresa.data.id} empresa={empresa.data} podeEditar={pode('administrar')} />}
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

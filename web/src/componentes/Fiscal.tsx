import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  Select,
  type SelectProps,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDebouncedValue } from '@mantine/hooks';
import { IconInfoCircle } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, baixarArquivo, consulta } from '../api/cliente';
import type { Municipio, NotaServico, ServicoNacional, StatusNotaServico, Venda } from '../api/tipos';
import { useSessao } from '../sessao/sessao';
import { data, hoje, moeda } from '../util/formato';
import { avisarErro, avisarSucesso, CampoData, CampoMoeda, MenuAcoes } from './comum';

export const STATUS_NOTA: Record<StatusNotaServico, { rotulo: string; cor: string }> = {
  PENDENTE: { rotulo: 'A emitir', cor: 'yellow' },
  EMITIDA: { rotulo: 'Emitida', cor: 'teal' },
  CANCELADA: { rotulo: 'Cancelada', cor: 'gray' },
};

/** Funciona com form.getInputProps, que entrega value e onChange como opcionais. */
type CampoBuscaProps = Omit<SelectProps, 'data' | 'value' | 'onChange'> & {
  value?: string | null;
  onChange?: (valor: string | null) => void;
};

/** Município da tabela do IBGE, buscado pelo nome. Guarda o código de 7 dígitos. */
export function CampoMunicipio({ value = null, onChange, ...props }: CampoBuscaProps) {
  const [busca, setBusca] = useState('');
  const [termo] = useDebouncedValue(busca, 250);
  const atual = useQuery({
    queryKey: ['municipio', value],
    queryFn: () => api.get<Municipio | null>(`/nfse/municipios/${value}`),
    enabled: !!value,
    staleTime: Infinity,
  });
  const lista = useQuery({
    queryKey: ['municipios', termo],
    queryFn: () => api.get<Municipio[]>(`/nfse/municipios${consulta({ busca: termo })}`),
    enabled: termo.trim().length >= 2,
    staleTime: Infinity,
  });
  const opcoes = [...(lista.data ?? []), ...(atual.data ? [atual.data] : [])].filter(
    (m, i, todos) => todos.findIndex((o) => o.codigo === m.codigo) === i,
  );
  return (
    <Select
      searchable
      clearable
      placeholder="Digite o nome da cidade"
      nothingFoundMessage={termo.trim().length < 2 ? 'Digite ao menos 2 letras' : 'Nenhum município'}
      data={opcoes.map((m) => ({ value: m.codigo, label: `${m.nome} - ${m.uf}` }))}
      value={value}
      onChange={onChange}
      onSearchChange={setBusca}
      filter={({ options }) => options}
      {...props}
    />
  );
}

/** Serviço da lista nacional (código de tributação de 6 dígitos), buscado pela descrição ou pelo código. */
export function CampoServicoNacional({ value = null, onChange, ...props }: CampoBuscaProps) {
  const [busca, setBusca] = useState('');
  const [termo] = useDebouncedValue(busca, 250);
  const lista = useQuery({
    queryKey: ['servicos-nacionais', termo || value],
    queryFn: () => api.get<ServicoNacional[]>(`/nfse/servicos${consulta({ busca: termo || value })}`),
    staleTime: Infinity,
  });
  const rotulo = (s: ServicoNacional) => `${s.codigo.replace(/(\d{2})(\d{2})(\d{2})/, '$1.$2.$3')} ${s.descricao}`;
  return (
    <Select
      searchable
      clearable
      placeholder="Busque pela descrição ou pelo código"
      nothingFoundMessage="Nenhum serviço na lista nacional"
      data={(lista.data ?? []).map((s) => ({ value: s.codigo, label: rotulo(s) }))}
      value={value}
      onChange={onChange}
      onSearchChange={setBusca}
      filter={({ options }) => options}
      maxDropdownHeight={320}
      comboboxProps={{ width: 'target' }}
      {...props}
    />
  );
}

function useInvalidarNotas() {
  const queryClient = useQueryClient();
  return () => {
    for (const chave of ['notas-servico', 'venda']) queryClient.invalidateQueries({ queryKey: [chave] });
  };
}

function FormGerar({ venda, aoFechar }: { venda: Venda; aoFechar: () => void }) {
  const invalidar = useInvalidarNotas();
  const form = useForm({
    initialValues: {
      dataCompetencia: venda.dataFaturamento as string | null,
      issRetido: false,
      aliquotaIss: '' as number | '',
      municipioPrestacao: null as string | null,
      descricao: '',
    },
    validate: {
      dataCompetencia: (v) => (!v ? 'Informe a data' : v > hoje() ? 'Não pode ser futura' : null),
      aliquotaIss: (v, c) => (!c.issRetido || (Number(v) >= 2 && Number(v) <= 5) ? null : 'Entre 2% e 5%'),
    },
  });
  const gerar = useMutation({
    mutationFn: (v: typeof form.values) =>
      api.post<NotaServico[]>(`/vendas/${venda.id}/notas-servico`, {
        dataCompetencia: v.dataCompetencia,
        issRetido: v.issRetido,
        aliquotaIss: v.issRetido ? Number(v.aliquotaIss) : undefined,
        municipioPrestacao: v.municipioPrestacao ?? undefined,
        descricao: v.descricao.trim() || undefined,
      }),
    onSuccess: (notas) => {
      invalidar();
      avisarSucesso(notas.length === 1 ? `DPS nº ${notas[0].numeroDps} gerada` : `${notas.length} DPS geradas`);
      aoFechar();
    },
    onError: avisarErro,
  });

  return (
    <form onSubmit={form.onSubmit((v) => gerar.mutate(v))}>
      <Stack>
        <Text size="sm">
          O ERP monta a DPS no padrão nacional com os serviços da venda nº {venda.numero} (produtos não entram) e confere o arquivo contra o
          esquema oficial. Depois, emita a nota no portal da prefeitura e informe aqui o número dela.
        </Text>
        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <CampoData label="Data da prestação (competência)" {...form.getInputProps('dataCompetencia')} />
          <CampoMunicipio label="Local da prestação" description="Vazio: o município da empresa" {...form.getInputProps('municipioPrestacao')} />
        </SimpleGrid>
        <Group align="flex-end">
          <Checkbox label="ISS retido pelo cliente" {...form.getInputProps('issRetido', { type: 'checkbox' })} />
          {form.values.issRetido && (
            <CampoMoeda
              label="Alíquota do ISS"
              prefix=""
              suffix=" %"
              w={140}
              description="Da sua faixa do Simples"
              {...form.getInputProps('aliquotaIss')}
            />
          )}
        </Group>
        <Textarea
          label="Descrição do serviço"
          description="Vazio: o ERP lista os serviços da venda e a referência dela"
          autosize
          minRows={2}
          maxRows={6}
          maxLength={2000}
          {...form.getInputProps('descricao')}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" loading={gerar.isPending}>
            Gerar DPS
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

function FormEmissao({ nota, aoFechar }: { nota: NotaServico; aoFechar: () => void }) {
  const invalidar = useInvalidarNotas();
  const form = useForm({
    initialValues: { numeroNfse: '', dataEmissao: hoje() as string | null, codigoVerificacao: '', chaveAcesso: '' },
    validate: {
      numeroNfse: (v) => (/^\d{1,15}$/.test(v.trim()) ? null : 'Só números, como aparece na nota'),
      dataEmissao: (v) => (!v ? 'Informe a data' : v < nota.dataCompetencia ? 'Não pode ser antes da competência' : null),
      chaveAcesso: (v) => (!v || /^[A-Za-z0-9]{50}$/.test(v.trim()) ? null : 'A chave tem 50 letras e números'),
    },
  });
  const salvar = useMutation({
    mutationFn: (v: typeof form.values) =>
      api.post(`/notas-servico/${nota.id}/emissao`, {
        numeroNfse: v.numeroNfse.trim(),
        dataEmissao: v.dataEmissao,
        codigoVerificacao: v.codigoVerificacao.trim() || undefined,
        chaveAcesso: v.chaveAcesso.trim() || undefined,
      }),
    onSuccess: () => {
      invalidar();
      avisarSucesso('Nota registrada como emitida');
      aoFechar();
    },
    onError: avisarErro,
  });
  return (
    <form onSubmit={form.onSubmit((v) => salvar.mutate(v))}>
      <Stack>
        <Text size="sm">Copie os dados da NFS-e emitida no portal da prefeitura para a DPS nº {nota.numeroDps}.</Text>
        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <TextInput label="Número da NFS-e" data-autofocus {...form.getInputProps('numeroNfse')} />
          <CampoData label="Data de emissão" {...form.getInputProps('dataEmissao')} />
        </SimpleGrid>
        <TextInput label="Código de verificação" description="Opcional" {...form.getInputProps('codigoVerificacao')} />
        <TextInput label="Chave de acesso" description="Opcional; 50 caracteres, na NFS-e do padrão nacional" {...form.getInputProps('chaveAcesso')} />
        <Group justify="flex-end">
          <Button variant="default" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" loading={salvar.isPending}>
            Registrar emissão
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

function FormCancelar({ nota, aoFechar }: { nota: NotaServico; aoFechar: () => void }) {
  const invalidar = useInvalidarNotas();
  const form = useForm({
    initialValues: { motivo: '' },
    validate: { motivo: (v) => (v.trim().length >= 5 ? null : 'Explique em poucas palavras (mínimo 5 letras)') },
  });
  const cancelar = useMutation({
    mutationFn: (v: typeof form.values) => api.post(`/notas-servico/${nota.id}/cancelamento`, { motivo: v.motivo.trim() }),
    onSuccess: () => {
      invalidar();
      avisarSucesso('Nota cancelada');
      aoFechar();
    },
    onError: avisarErro,
  });
  return (
    <form onSubmit={form.onSubmit((v) => cancelar.mutate(v))}>
      <Stack>
        {nota.status === 'EMITIDA' && (
          <Alert color="orange" icon={<IconInfoCircle size={18} />}>
            Esta NFS-e já foi emitida. Cancele-a também no portal da prefeitura: aqui o ERP só registra o cancelamento.
          </Alert>
        )}
        <TextInput label="Motivo" placeholder="Valor errado; nota substituída" data-autofocus {...form.getInputProps('motivo')} />
        <Group justify="flex-end">
          <Button variant="default" onClick={aoFechar}>
            Voltar
          </Button>
          <Button type="submit" color="red" loading={cancelar.isPending}>
            Cancelar nota
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

/** Ações de uma nota (baixar XML, registrar emissão, cancelar), com os formulários delas. */
export function useAcoesNota() {
  const { pode } = useSessao();
  const [emitindo, setEmitindo] = useState<NotaServico | null>(null);
  const [cancelando, setCancelando] = useState<NotaServico | null>(null);
  const escrever = pode('escreverFinanceiro');

  const itens = (nota: NotaServico) => [
    nota.status !== 'CANCELADA' && {
      texto: 'Baixar XML da DPS',
      aoClicar: () => baixarArquivo(`/notas-servico/${nota.id}/xml`, `DPS-${nota.serie}-${nota.numeroDps}.xml`).catch(avisarErro),
    },
    escrever && nota.status === 'PENDENTE' && { texto: 'Registrar emissão', aoClicar: () => setEmitindo(nota) },
    escrever && nota.status !== 'CANCELADA' && { texto: 'Cancelar nota', aoClicar: () => setCancelando(nota), perigosa: true },
  ];
  const modais = (
    <>
      <Modal opened={emitindo !== null} onClose={() => setEmitindo(null)} title="Registrar NFS-e emitida" size="lg">
        {emitindo && <FormEmissao nota={emitindo} aoFechar={() => setEmitindo(null)} />}
      </Modal>
      <Modal opened={cancelando !== null} onClose={() => setCancelando(null)} title={`Cancelar DPS nº ${cancelando?.numeroDps ?? ''}`}>
        {cancelando && <FormCancelar nota={cancelando} aoFechar={() => setCancelando(null)} />}
      </Modal>
    </>
  );
  return { itens, modais };
}

/** Notas de serviço de uma venda faturada, no detalhe da venda. */
export function NotasDaVenda({ venda }: { venda: Venda }) {
  const { pode } = useSessao();
  const [gerando, setGerando] = useState(false);
  const acoes = useAcoesNota();
  const notas = useQuery({
    queryKey: ['notas-servico', { vendaId: venda.id }],
    queryFn: () => api.get<NotaServico[]>(`/notas-servico?vendaId=${venda.id}`),
  });
  const temServicos = (venda.itens ?? []).some((i) => i.produto?.tipo === 'SERVICO');
  const ativas = (notas.data ?? []).filter((n) => n.status !== 'CANCELADA');

  if (!temServicos) {
    return (
      <Text size="sm" c="dimmed">
        A venda não tem serviços; produtos saem em NF-e, que o ERP ainda não emite.
      </Text>
    );
  }
  if (notas.isPending) return <Loader size="sm" />;
  return (
    <Stack gap="xs">
      {(notas.data ?? []).length > 0 && (
        <Table style={{ fontVariantNumeric: 'tabular-nums' }}>
          <Table.Tbody>
            {notas.data!.map((n) => (
              <Table.Tr key={n.id}>
                <Table.Td>
                  DPS {n.numeroDps}
                  {n.numeroNfse && (
                    <Text size="xs" c="dimmed">
                      NFS-e {n.numeroNfse} em {data(n.dataEmissaoNfse)}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td ta="right">{moeda(n.valorServicos - n.descontoIncondicionado)}</Table.Td>
                <Table.Td ta="right">
                  <Badge variant="light" color={STATUS_NOTA[n.status].cor}>
                    {STATUS_NOTA[n.status].rotulo}
                  </Badge>
                </Table.Td>
                <Table.Td w={40}>
                  <MenuAcoes rotulo={`DPS ${n.numeroDps}`} itens={acoes.itens(n)} />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {ativas.length === 0 && pode('escreverFinanceiro') && (
        <Group>
          <Button size="xs" variant="light" onClick={() => setGerando(true)}>
            Gerar nota de serviço
          </Button>
        </Group>
      )}
      {ativas.length === 0 && !pode('escreverFinanceiro') && (
        <Text size="sm" c="dimmed">
          Nenhuma nota de serviço ainda.
        </Text>
      )}
      <Modal opened={gerando} onClose={() => setGerando(false)} title={`Nota de serviço da venda nº ${venda.numero}`} size="lg">
        {gerando && <FormGerar venda={venda} aoFechar={() => setGerando(false)} />}
      </Modal>
      {acoes.modais}
    </Stack>
  );
}

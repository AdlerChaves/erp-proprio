import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Grid,
  Group,
  Loader,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { IconChevronLeft, IconChevronRight, IconInfoCircle, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, consulta } from '../api/cliente';
import type { CentroCusto, CobrancaDoMes, Contrato, EstadoCobranca, MesContratos, Pessoa, PlanoConta, Produto, SituacaoContrato } from '../api/tipos';
import { avisarErro, avisarSucesso, Cabecalho, CampoMoeda, Confirmacao, ErroCarregamento, MenuAcoes } from '../componentes/comum';
import { CampoQuantidade } from '../componentes/Documento';
import { useSessao } from '../sessao/sessao';
import { data, hoje, mesAno, moeda, totalItemCentavos } from '../util/formato';

const ESTADOS: Record<EstadoCobranca, { rotulo: string; cor: string }> = {
  AGENDADA: { rotulo: 'Agendada', cor: 'gray' },
  A_GERAR: { rotulo: 'A gerar', cor: 'yellow' },
  PAUSADO: { rotulo: 'Pausado', cor: 'gray' },
  PROCESSANDO: { rotulo: 'Gerando', cor: 'blue' },
  FALHA: { rotulo: 'Falhou', cor: 'red' },
  NOTA_PENDENTE: { rotulo: 'Nota pendente', cor: 'orange' },
  VENDA_CANCELADA: { rotulo: 'Venda cancelada', cor: 'gray' },
  CONCLUIDA: { rotulo: 'Gerada', cor: 'teal' },
};
const GERAVEIS: EstadoCobranca[] = ['AGENDADA', 'A_GERAR', 'FALHA', 'VENDA_CANCELADA'];

const SITUACOES: { value: SituacaoContrato; label: string }[] = [
  { value: 'ATIVO', label: 'Ativos' },
  { value: 'PAUSADO', label: 'Pausados' },
  { value: 'ENCERRADO', label: 'Encerrados' },
];

/** "2026-10" ± meses. */
function somarMes(competencia: string, meses: number) {
  const [ano, mes] = competencia.split('-').map(Number);
  const total = ano * 12 + mes - 1 + meses;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** "2026-10" → "Outubro de 2026". */
const mesPorExtenso = (competencia: string) => {
  const nome = MESES[Number(competencia.slice(5)) - 1];
  return `${nome[0].toUpperCase()}${nome.slice(1)} de ${competencia.slice(0, 4)}`;
};
/** "2026-10-05" → "05/10". */
const diaMes = (dataIso: string) => data(dataIso).slice(0, 5);

function useInvalidar() {
  const queryClient = useQueryClient();
  return () => {
    for (const chave of ['contratos', 'contratos-mes', 'vendas', 'notas-servico', 'contas-receber']) queryClient.invalidateQueries({ queryKey: [chave] });
  };
}

/** O que aconteceu (ou vai acontecer) com a cobrança: venda, nota, erro. */
function DetalheCobranca({ item }: { item: CobrancaDoMes }) {
  const nota = item.notas[0];
  const linhas: { texto: string; cor?: string }[] = [];
  if (item.estado === 'AGENDADA') linhas.push({ texto: `Gera sozinho em ${diaMes(item.faturamento)}` });
  if (item.estado === 'A_GERAR') linhas.push({ texto: 'O dia do faturamento já passou' });
  if (item.venda) linhas.push({ texto: `Venda nº ${item.venda.numero}${nota?.numeroNfse ? ` · NFS-e nº ${nota.numeroNfse}` : nota ? ` · DPS nº ${nota.numeroDps}` : ''}` });
  if (item.estado === 'FALHA' && item.geracao?.erro) linhas.push({ texto: item.geracao.erro, cor: 'red' });
  if (item.estado === 'NOTA_PENDENTE') {
    linhas.push(nota?.erroTransmissao ? { texto: nota.erroTransmissao, cor: 'orange.8' } : { texto: 'Transmita a nota em Notas de serviço' });
  }
  return (
    <>
      <Badge color={ESTADOS[item.estado].cor}>{ESTADOS[item.estado].rotulo}</Badge>
      {linhas.map((l) => (
        <Text key={l.texto} size="xs" c={l.cor ?? 'dimmed'} lineClamp={2} title={l.texto} mt={2}>
          {l.texto}
        </Text>
      ))}
    </>
  );
}

function CobrancasDoMes() {
  const { pode } = useSessao();
  const escrever = pode('escreverFinanceiro');
  const invalidar = useInvalidar();
  const atual = hoje().slice(0, 7);
  const [competencia, setCompetencia] = useState(atual);
  const mes = useQuery({
    queryKey: ['contratos-mes', competencia],
    queryFn: () => api.get<MesContratos>(`/contratos/mes${consulta({ competencia })}`),
  });
  const gerarTodos = useMutation({
    mutationFn: () => api.post<MesContratos & { geradas: number; falhas: number }>('/contratos/geracoes', { competencia }),
    onSuccess: (r) => {
      if (r.falhas) avisarErro(new Error(`${r.geradas} cobrança(s) gerada(s) e ${r.falhas} com falha; veja o motivo na lista`));
      else avisarSucesso(r.geradas ? `${r.geradas} cobrança(s) gerada(s)` : 'Nada a gerar');
    },
    onError: avisarErro,
    onSettled: invalidar,
  });
  const gerarUm = useMutation({
    mutationFn: (contratoId: string) => api.post<CobrancaDoMes>(`/contratos/${contratoId}/geracoes`, { competencia }),
    onSuccess: (r) => {
      if (r?.estado === 'FALHA') avisarErro(new Error(r.geracao?.erro ?? 'A geração falhou'));
      else avisarSucesso(`Cobrança do contrato nº ${r?.contrato.numero} gerada`);
    },
    onError: avisarErro,
    onSettled: invalidar,
  });
  const futuro = competencia > atual;
  const pendentes = mes.data?.itens.filter((i) => GERAVEIS.includes(i.estado) && i.contrato.situacao === 'ATIVO').length ?? 0;

  return (
    <Card withBorder padding="lg">
      <Group justify="space-between" mb="md" wrap="wrap" gap="sm">
        <Group gap={6} wrap="nowrap">
          <ActionIcon variant="default" aria-label="Mês anterior" onClick={() => setCompetencia(somarMes(competencia, -1))}>
            <IconChevronLeft size={16} />
          </ActionIcon>
          <Title order={4} miw={170} ta="center">
            {mesPorExtenso(competencia)}
          </Title>
          <ActionIcon variant="default" aria-label="Próximo mês" onClick={() => setCompetencia(somarMes(competencia, 1))}>
            <IconChevronRight size={16} />
          </ActionIcon>
          {competencia !== atual && (
            <Button variant="subtle" size="compact-sm" onClick={() => setCompetencia(atual)}>
              Este mês
            </Button>
          )}
        </Group>
        <Group gap="lg" wrap="wrap">
          {mes.data && mes.data.resumo.contratos > 0 && (
            <Group gap="lg" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <div>
                <Text size="xs" c="dimmed">
                  Gerado
                </Text>
                <Text fw={600}>{moeda(mes.data.resumo.gerado)}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">
                  A gerar
                </Text>
                <Text fw={600}>{moeda(mes.data.resumo.aGerar)}</Text>
              </div>
            </Group>
          )}
          {escrever && pendentes > 0 && !futuro && (
            <Button loading={gerarTodos.isPending} onClick={() => gerarTodos.mutate()}>
              {pendentes === 1 ? 'Gerar a cobrança pendente' : `Gerar as ${pendentes} cobranças pendentes`}
            </Button>
          )}
        </Group>
      </Group>

      {mes.isPending ? (
        <Loader size="sm" />
      ) : mes.isError ? (
        <ErroCarregamento erro={mes.error} />
      ) : mes.data.itens.length === 0 ? (
        <Text c="dimmed" size="sm">
          Nenhum contrato com cobrança em {mesAno(competencia)}.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={760}>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Contrato</Table.Th>
                <Table.Th w={110}>Faturamento</Table.Th>
                <Table.Th w={110}>Vencimento</Table.Th>
                <Table.Th w={130} ta="right">
                  Valor
                </Table.Th>
                <Table.Th w={260}>Situação</Table.Th>
                <Table.Th w={48} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {mes.data.itens.map((item) => (
                <Table.Tr key={item.contrato.id}>
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      {item.contrato.descricao}
                    </Text>
                    <Text size="xs" c="dimmed">
                      nº {item.contrato.numero} · {item.contrato.cliente.nome}
                    </Text>
                  </Table.Td>
                  <Table.Td>{data(item.faturamento)}</Table.Td>
                  <Table.Td>{data(item.vencimento)}</Table.Td>
                  <Table.Td ta="right">{moeda(item.venda?.total ?? item.contrato.valor)}</Table.Td>
                  <Table.Td>
                    <DetalheCobranca item={item} />
                  </Table.Td>
                  <Table.Td>
                    <MenuAcoes
                      rotulo={`contrato nº ${item.contrato.numero}`}
                      itens={[
                        escrever &&
                          !futuro &&
                          item.contrato.situacao === 'ATIVO' &&
                          GERAVEIS.includes(item.estado) && {
                            texto: item.estado === 'FALHA' ? 'Tentar de novo' : item.estado === 'AGENDADA' ? 'Gerar agora (antecipar)' : 'Gerar agora',
                            aoClicar: () => gerarUm.mutate(item.contrato.id),
                          },
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
  );
}

interface LinhaItem {
  chave: string;
  produtoId: string | null;
  quantidade: number | string;
  preco: number | string;
  desconto: number | string;
}
let sequencia = 0;
const novaLinha = (): LinhaItem => ({ chave: `l${++sequencia}`, produtoId: null, quantidade: 1, preco: 0, desconto: 0 });
const totalDaLinha = (l: LinhaItem) => totalItemCentavos(Number(l.quantidade) || 0, Number(l.preco) || 0, Number(l.desconto) || 0);

function FormContrato({ contrato, aoFechar }: { contrato: Contrato | null; aoFechar: () => void }) {
  const invalidar = useInvalidar();
  const clientes = useQuery({ queryKey: ['/clientes'], queryFn: () => api.get<Pessoa[]>('/clientes') });
  const produtos = useQuery({ queryKey: ['/produtos'], queryFn: () => api.get<Produto[]>('/produtos') });
  const plano = useQuery({ queryKey: ['/plano-contas'], queryFn: () => api.get<PlanoConta[]>('/plano-contas') });
  const centros = useQuery({ queryKey: ['/centros-custo'], queryFn: () => api.get<CentroCusto[]>('/centros-custo') });
  const form = useForm({
    initialValues: {
      clienteId: contrato?.clienteId ?? (null as string | null),
      descricao: contrato?.descricao ?? '',
      itens: (contrato?.itens?.map((i) => ({ chave: i.id, produtoId: i.produtoId, quantidade: i.quantidade, preco: i.precoUnitario, desconto: i.desconto })) ?? [
        novaLinha(),
      ]) as LinhaItem[],
      inicio: `${contrato?.inicio ?? hoje().slice(0, 7)}-01` as string | null,
      fim: contrato?.fim ? `${contrato.fim}-01` : (null as string | null),
      diaFaturamento: contrato?.diaFaturamento ?? (1 as number | string),
      diaVencimento: contrato?.diaVencimento ?? (10 as number | string),
      emitirNfse: contrato?.emitirNfse ?? false,
      transmitirNfse: contrato?.transmitirNfse ?? false,
      planoContaId: contrato?.planoContaId ?? (null as string | null),
      centroCustoId: contrato?.centroCustoId ?? (null as string | null),
      observacoes: contrato?.observacoes ?? '',
    },
    validate: {
      clienteId: (v) => (v ? null : 'Escolha o cliente'),
      descricao: (v) => (v.trim() ? null : 'Dê um nome ao contrato, como "Suporte mensal"'),
      inicio: (v) => (v ? null : 'Informe o primeiro mês'),
      itens: { produtoId: (v) => (v ? null : 'Escolha o item') },
      diaFaturamento: (v) => (Number(v) >= 1 && Number(v) <= 28 ? null : 'De 1 a 28'),
      diaVencimento: (v) => (Number(v) >= 1 && Number(v) <= 28 ? null : 'De 1 a 28'),
    },
  });
  const produtoDe = (id: string | null) => produtos.data?.find((p) => p.id === id);
  const total = form.values.itens.reduce((s, l) => s + totalDaLinha(l), 0) / 100;
  const temServico = form.values.itens.some((l) => produtoDe(l.produtoId)?.tipo === 'SERVICO');
  const fat = Number(form.values.diaFaturamento) || 0;
  const venc = Number(form.values.diaVencimento) || 0;

  const salvar = useMutation({
    mutationFn: (v: typeof form.values) => {
      const corpo = {
        clienteId: v.clienteId,
        descricao: v.descricao.trim(),
        itens: v.itens.map((l) => ({ produtoId: l.produtoId, quantidade: Number(l.quantidade), precoUnitario: Number(l.preco), desconto: Number(l.desconto) || 0 })),
        inicio: v.inicio!.slice(0, 7),
        fim: v.fim ? v.fim.slice(0, 7) : null,
        diaFaturamento: Number(v.diaFaturamento),
        diaVencimento: Number(v.diaVencimento),
        emitirNfse: v.emitirNfse,
        transmitirNfse: v.emitirNfse && v.transmitirNfse,
        planoContaId: v.planoContaId,
        centroCustoId: v.centroCustoId,
        observacoes: v.observacoes.trim() || null,
      };
      return contrato ? api.patch<Contrato>(`/contratos/${contrato.id}`, corpo) : api.post<Contrato>('/contratos', corpo);
    },
    onSuccess: (salvo) => {
      invalidar();
      avisarSucesso(contrato ? 'Contrato alterado; vale para as próximas cobranças' : `Contrato nº ${salvo.numero} criado`);
      aoFechar();
    },
    onError: avisarErro,
  });

  return (
    <form onSubmit={form.onSubmit((v) => salvar.mutate(v))}>
      <Stack>
        <Grid>
          <Grid.Col span={{ base: 12, sm: 7 }}>
            <Select
              label="Cliente"
              data={(clientes.data ?? []).filter((c) => c.ativo || c.id === contrato?.clienteId).map((c) => ({ value: c.id, label: c.nome }))}
              searchable
              nothingFoundMessage="Nada encontrado"
              data-autofocus
              {...form.getInputProps('clienteId')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 5 }}>
            <TextInput label="Nome do contrato" placeholder="Suporte técnico mensal" maxLength={120} {...form.getInputProps('descricao')} />
          </Grid.Col>
        </Grid>

        <Table.ScrollContainer minWidth={680}>
          <Table verticalSpacing={4}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Item cobrado todo mês</Table.Th>
                <Table.Th w={110}>Quantidade</Table.Th>
                <Table.Th w={140}>Preço combinado</Table.Th>
                <Table.Th w={130}>Desconto</Table.Th>
                <Table.Th w={110} ta="right">
                  Total
                </Table.Th>
                <Table.Th w={40} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {form.values.itens.map((linha, i) => (
                <Table.Tr key={linha.chave}>
                  <Table.Td>
                    <Select
                      aria-label={`Item ${i + 1}`}
                      placeholder="Busque o serviço ou produto"
                      data={(produtos.data ?? [])
                        .filter((p) => p.ativo || p.id === linha.produtoId)
                        .map((p) => ({ value: p.id, label: `${p.codigo} - ${p.descricao}` }))}
                      searchable
                      nothingFoundMessage="Nada encontrado"
                      {...form.getInputProps(`itens.${i}.produtoId`)}
                      onChange={(id) => {
                        form.setFieldValue(`itens.${i}.produtoId`, id);
                        const escolhido = produtoDe(id);
                        if (escolhido) form.setFieldValue(`itens.${i}.preco`, escolhido.precoVenda);
                      }}
                    />
                  </Table.Td>
                  <Table.Td>
                    <CampoQuantidade aria-label={`Quantidade do item ${i + 1}`} {...form.getInputProps(`itens.${i}.quantidade`)} />
                  </Table.Td>
                  <Table.Td>
                    <CampoMoeda aria-label={`Preço do item ${i + 1}`} {...form.getInputProps(`itens.${i}.preco`)} />
                  </Table.Td>
                  <Table.Td>
                    <CampoMoeda aria-label={`Desconto do item ${i + 1}`} {...form.getInputProps(`itens.${i}.desconto`)} />
                  </Table.Td>
                  <Table.Td ta="right" fw={500}>
                    {moeda(totalDaLinha(linha) / 100)}
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label={`Remover item ${i + 1}`}
                      disabled={form.values.itens.length === 1}
                      onClick={() => form.removeListItem('itens', i)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        <Group justify="space-between">
          <Button variant="subtle" size="compact-sm" leftSection={<IconPlus size={14} />} onClick={() => form.insertListItem('itens', novaLinha())}>
            Adicionar item
          </Button>
          <Text fw={600} size="lg" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {moeda(total)} por mês
          </Text>
        </Group>

        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          <MonthPickerInput label="Primeiro mês" valueFormat="MM/YYYY" {...form.getInputProps('inicio')} />
          <MonthPickerInput label="Último mês" placeholder="Sem fim" valueFormat="MM/YYYY" clearable {...form.getInputProps('fim')} />
          <NumberInput label="Dia do faturamento" min={1} max={28} allowDecimal={false} {...form.getInputProps('diaFaturamento')} />
          <NumberInput label="Dia do vencimento" min={1} max={28} allowDecimal={false} {...form.getInputProps('diaVencimento')} />
        </SimpleGrid>
        {fat >= 1 && venc >= 1 && (
          <Text size="xs" c="dimmed" mt={-8}>
            Todo dia {fat}, o ERP gera a venda e a conta a receber, que vence no dia {venc}
            {venc < fat ? ' do mês seguinte' : ' do mesmo mês'}.
          </Text>
        )}

        <Card withBorder padding="sm" bg="var(--relda-fundo)">
          <Stack gap="xs">
            <Switch
              label="Gerar a nota fiscal de serviço todo mês"
              description={temServico || !form.values.emitirNfse ? 'A DPS dos serviços do contrato, como na venda' : 'O contrato precisa de ao menos um serviço'}
              {...form.getInputProps('emitirNfse', { type: 'checkbox' })}
            />
            <Checkbox
              ml={46}
              label="Transmitir ao Emissor Nacional sem pedir confirmação"
              description="Usa o certificado digital da empresa; se a nota for recusada, ela fica pendente para você ver"
              disabled={!form.values.emitirNfse}
              {...form.getInputProps('transmitirNfse', { type: 'checkbox' })}
            />
          </Stack>
        </Card>

        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select
            label="Categoria"
            placeholder="Opcional"
            data={(plano.data ?? []).filter((c) => c.tipo === 'RECEITA' && c.aceitaLancamento && c.ativo).map((c) => ({ value: c.id, label: `${c.codigo} ${c.nome}` }))}
            searchable
            clearable
            {...form.getInputProps('planoContaId')}
          />
          <Select
            label="Centro de custo"
            placeholder="Opcional"
            data={(centros.data ?? []).filter((c) => c.ativo).map((c) => ({ value: c.id, label: c.nome }))}
            searchable
            clearable
            {...form.getInputProps('centroCustoId')}
          />
        </SimpleGrid>
        <Textarea
          label="Observações"
          description="Vão em toda venda gerada e, por ela, na descrição da nota fiscal"
          autosize
          minRows={1}
          maxRows={3}
          maxLength={300}
          {...form.getInputProps('observacoes')}
        />
        {contrato && (
          <Alert color="gray" icon={<IconInfoCircle size={18} />}>
            As mudanças valem para as próximas cobranças; as já geradas não mudam.
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" loading={salvar.isPending}>
            {contrato ? 'Salvar' : 'Criar contrato'}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

const descreverNota = (c: Contrato) => (c.transmitirNfse ? 'Emite e transmite' : c.emitirNfse ? 'Gera a DPS' : 'Sem nota');

function ListaContratos({ aoEditar }: { aoEditar: (c: Contrato) => void }) {
  const { pode } = useSessao();
  const escrever = pode('escreverFinanceiro');
  const invalidar = useInvalidar();
  const [situacao, setSituacao] = useState<SituacaoContrato>('ATIVO');
  const [encerrando, setEncerrando] = useState<Contrato | null>(null);
  const [excluindo, setExcluindo] = useState<Contrato | null>(null);
  const lista = useQuery({ queryKey: ['contratos', situacao], queryFn: () => api.get<Contrato[]>(`/contratos${consulta({ situacao })}`) });
  const acao = useMutation({
    mutationFn: ({ contrato, rota }: { contrato: Contrato; rota: 'pausa' | 'reativacao' | 'encerramento' | 'excluir' }) =>
      rota === 'excluir' ? api.delete(`/contratos/${contrato.id}`) : api.post(`/contratos/${contrato.id}/${rota}`),
    onSuccess: (_, { rota }) => {
      avisarSucesso({ pausa: 'Contrato pausado', reativacao: 'Contrato reativado', encerramento: 'Contrato encerrado', excluir: 'Contrato excluído' }[rota]);
      setEncerrando(null);
      setExcluindo(null);
    },
    onError: avisarErro,
    onSettled: invalidar,
  });
  const editar = async (c: Contrato) => aoEditar(await api.get<Contrato>(`/contratos/${c.id}`));

  return (
    <Card withBorder padding={0}>
      <Tabs value={situacao} onChange={(v) => setSituacao((v as SituacaoContrato) ?? 'ATIVO')}>
        <Tabs.List px="md" pt="xs">
          {SITUACOES.map((s) => (
            <Tabs.Tab key={s.value} value={s.value}>
              {s.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
      {lista.isPending ? (
        <Loader m="md" size="sm" />
      ) : lista.isError ? (
        <ErroCarregamento erro={lista.error} />
      ) : lista.data.length === 0 ? (
        <Text c="dimmed" p="md" size="sm">
          {situacao === 'ATIVO'
            ? 'Nenhum contrato ativo. Cadastre os serviços que você cobra todo mês e o ERP passa a gerar as cobranças sozinho.'
            : 'Nenhum contrato aqui.'}
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={760}>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={60}>Nº</Table.Th>
                <Table.Th>Contrato</Table.Th>
                <Table.Th w={130} ta="right">
                  Valor mensal
                </Table.Th>
                <Table.Th w={150}>Fatura · vence</Table.Th>
                <Table.Th w={170}>Vigência</Table.Th>
                <Table.Th w={140}>Nota fiscal</Table.Th>
                <Table.Th w={48} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {lista.data.map((c) => (
                <Table.Tr key={c.id}>
                  <Table.Td fw={600}>{c.numero}</Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      {c.descricao}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {c.cliente.nome}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">{moeda(c.valor)}</Table.Td>
                  <Table.Td>
                    Dia {c.diaFaturamento} · dia {c.diaVencimento}
                  </Table.Td>
                  <Table.Td>
                    {mesAno(c.inicio)} → {c.fim ? mesAno(c.fim) : 'sem fim'}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c={c.emitirNfse ? undefined : 'dimmed'}>
                      {descreverNota(c)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <MenuAcoes
                      rotulo={`contrato nº ${c.numero}`}
                      itens={[
                        escrever && c.situacao !== 'ENCERRADO' && { texto: 'Editar', aoClicar: () => void editar(c).catch(avisarErro) },
                        escrever && c.situacao === 'ATIVO' && { texto: 'Pausar', aoClicar: () => acao.mutate({ contrato: c, rota: 'pausa' }) },
                        escrever && c.situacao === 'PAUSADO' && { texto: 'Reativar', aoClicar: () => acao.mutate({ contrato: c, rota: 'reativacao' }) },
                        escrever && c.situacao !== 'ENCERRADO' && { texto: 'Encerrar', aoClicar: () => setEncerrando(c), perigosa: true },
                        pode('administrar') && { texto: 'Excluir', aoClicar: () => setExcluindo(c), perigosa: true },
                      ]}
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <Confirmacao
        aberta={encerrando !== null}
        titulo={`Encerrar o contrato nº ${encerrando?.numero ?? ''}`}
        mensagem="O contrato para de gerar cobranças. As vendas, contas e notas já geradas continuam como estão. Não dá para reativar depois."
        rotuloConfirmar="Encerrar"
        perigosa
        carregando={acao.isPending}
        aoConfirmar={() => encerrando && acao.mutate({ contrato: encerrando, rota: 'encerramento' })}
        aoFechar={() => setEncerrando(null)}
      />
      <Confirmacao
        aberta={excluindo !== null}
        titulo={`Excluir o contrato nº ${excluindo?.numero ?? ''}`}
        mensagem="Só é possível excluir contrato que nunca gerou cobrança; os outros devem ser encerrados."
        rotuloConfirmar="Excluir"
        perigosa
        carregando={acao.isPending}
        aoConfirmar={() => excluindo && acao.mutate({ contrato: excluindo, rota: 'excluir' })}
        aoFechar={() => setExcluindo(null)}
      />
    </Card>
  );
}

export function Contratos() {
  const { pode } = useSessao();
  const [formulario, setFormulario] = useState<{ contrato: Contrato | null } | null>(null);
  return (
    <Stack gap="lg">
      <Cabecalho
        titulo="Contratos"
        descricao="Serviços cobrados todo mês: no dia combinado, o ERP gera a venda, a conta a receber e a nota fiscal sozinho."
        acoes={
          pode('escreverFinanceiro') && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setFormulario({ contrato: null })}>
              Novo contrato
            </Button>
          )
        }
      />
      <CobrancasDoMes />
      <ListaContratos aoEditar={(contrato) => setFormulario({ contrato })} />
      <Modal
        opened={formulario !== null}
        onClose={() => setFormulario(null)}
        title={formulario?.contrato ? `Contrato nº ${formulario.contrato.numero}` : 'Novo contrato'}
        size="xl"
      >
        {formulario && <FormContrato contrato={formulario.contrato} aoFechar={() => setFormulario(null)} />}
      </Modal>
    </Stack>
  );
}

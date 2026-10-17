import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Divider,
  Drawer,
  Group,
  Loader,
  Menu,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconDots, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { api, consulta } from '../api/cliente';
import type { CentroCusto, ContaBancaria, ContaFinanceira, Pessoa, PlanoConta, StatusConta, TipoPlanoConta } from '../api/tipos';
import { avisarErro, avisarSucesso, Cabecalho, CampoData, CampoMoeda, Confirmacao, ErroCarregamento } from '../componentes/comum';
import { useSessao } from '../sessao/sessao';
import { data, hoje, moeda, STATUS_CONTA, vencida } from '../util/formato';

export interface ConfigContas {
  rota: '/contas-receber' | '/contas-pagar';
  titulo: string;
  descricao: string;
  pessoa: { campo: 'clienteId' | 'fornecedorId'; relacao: 'cliente' | 'fornecedor'; rota: '/clientes' | '/fornecedores'; rotulo: string };
  tipoCategoria: TipoPlanoConta;
  /** "Receber" ou "Pagar", para os botões de baixa. */
  verbo: string;
}

export const RECEBER: ConfigContas = {
  rota: '/contas-receber',
  titulo: 'Contas a receber',
  descricao: 'Vendas e serviços a receber de clientes',
  pessoa: { campo: 'clienteId', relacao: 'cliente', rota: '/clientes', rotulo: 'Cliente' },
  tipoCategoria: 'RECEITA',
  verbo: 'Receber',
};

export const PAGAR: ConfigContas = {
  rota: '/contas-pagar',
  titulo: 'Contas a pagar',
  descricao: 'Compras e despesas a pagar a fornecedores',
  pessoa: { campo: 'fornecedorId', relacao: 'fornecedor', rota: '/fornecedores', rotulo: 'Fornecedor' },
  tipoCategoria: 'DESPESA',
  verbo: 'Pagar',
};

type FiltroStatus = 'EM_ABERTO' | StatusConta | 'TODAS';

const FILTROS_STATUS: { value: FiltroStatus; label: string }[] = [
  { value: 'EM_ABERTO', label: 'Em aberto (inclui parciais)' },
  { value: 'ABERTA', label: 'Sem pagamento' },
  { value: 'PARCIAL', label: 'Parciais' },
  { value: 'PAGA', label: 'Pagas' },
  { value: 'CANCELADA', label: 'Canceladas' },
  { value: 'TODAS', label: 'Todas' },
];

/** Cadastros usados nos formulários: categorias do tipo da conta, centros de custo e contas bancárias. */
function useApoio(config: ConfigContas) {
  const pessoas = useQuery({ queryKey: [config.pessoa.rota], queryFn: () => api.get<Pessoa[]>(config.pessoa.rota) });
  const plano = useQuery({ queryKey: ['/plano-contas'], queryFn: () => api.get<PlanoConta[]>('/plano-contas') });
  const centros = useQuery({ queryKey: ['/centros-custo'], queryFn: () => api.get<CentroCusto[]>('/centros-custo') });
  const bancos = useQuery({ queryKey: ['/contas-bancarias'], queryFn: () => api.get<ContaBancaria[]>('/contas-bancarias') });
  return {
    pessoas: (pessoas.data ?? []).filter((p) => p.ativo).map((p) => ({ value: p.id, label: p.nome })),
    categorias: (plano.data ?? [])
      .filter((c) => c.tipo === config.tipoCategoria && c.aceitaLancamento && c.ativo)
      .map((c) => ({ value: c.id, label: `${c.codigo} ${c.nome}` })),
    centros: (centros.data ?? []).filter((c) => c.ativo).map((c) => ({ value: c.id, label: c.nome })),
    bancos: (bancos.data ?? []).filter((c) => c.ativo).map((c) => ({ value: c.id, label: c.nome })),
  };
}

function useInvalidar(config: ConfigContas) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: [config.rota] });
    queryClient.invalidateQueries({ queryKey: ['saldos'] });
    queryClient.invalidateQueries({ queryKey: ['fluxo-caixa'] });
  };
}

function FormConta({ config, conta, aoFechar }: { config: ConfigContas; conta: ContaFinanceira | null; aoFechar: () => void }) {
  const apoio = useApoio(config);
  const invalidar = useInvalidar(config);
  const soClassificacao = !!conta && conta.status !== 'ABERTA';
  const form = useForm({
    initialValues: {
      pessoaId: conta?.[config.pessoa.campo] ?? '',
      descricao: conta?.descricao ?? '',
      valor: conta?.valor ?? ('' as number | ''),
      dataEmissao: conta?.dataEmissao ?? hoje(),
      dataVencimento: conta?.dataVencimento ?? '',
      planoContaId: conta?.planoContaId ?? '',
      centroCustoId: conta?.centroCustoId ?? '',
      parcelas: 1,
    },
    validate: {
      pessoaId: (v) => (conta || v ? null : `Escolha o ${config.pessoa.rotulo.toLowerCase()}`),
      descricao: (v) => (v.trim() ? null : 'Descreva a conta'),
      valor: (v) => (Number(v) > 0 ? null : 'Informe um valor maior que zero'),
      dataVencimento: (v, c) => (!v ? 'Informe o vencimento' : v < c.dataEmissao ? 'O vencimento não pode ser antes da emissão' : null),
      parcelas: (v) => (Number.isInteger(v) && v >= 1 && v <= 120 ? null : 'Entre 1 e 120'),
    },
  });

  const salvar = useMutation({
    mutationFn: (v: typeof form.values) => {
      const classificacao = { planoContaId: v.planoContaId || null, centroCustoId: v.centroCustoId || null };
      if (soClassificacao) return api.patch(`${config.rota}/${conta!.id}`, classificacao);
      const dados = {
        descricao: v.descricao.trim(),
        valor: Number(v.valor),
        dataEmissao: v.dataEmissao,
        dataVencimento: v.dataVencimento,
        ...classificacao,
      };
      if (conta) return api.patch(`${config.rota}/${conta.id}`, dados);
      const nova = {
        ...dados,
        [config.pessoa.campo]: v.pessoaId,
        planoContaId: v.planoContaId || undefined,
        centroCustoId: v.centroCustoId || undefined,
      };
      return v.parcelas > 1
        ? api.post(`${config.rota}/parcelamentos`, { ...nova, parcelas: v.parcelas })
        : api.post(config.rota, nova);
    },
    onSuccess: () => {
      invalidar();
      avisarSucesso(conta ? 'Alterações salvas' : form.values.parcelas > 1 ? `${form.values.parcelas} parcelas lançadas` : 'Conta lançada');
      aoFechar();
    },
    onError: avisarErro,
  });

  const parcelado = !conta && form.values.parcelas > 1;
  return (
    <form onSubmit={form.onSubmit((v) => salvar.mutate(v))}>
      <Stack>
        {soClassificacao && (
          <Text size="sm" c="dimmed">
            Esta conta já tem pagamentos ou foi cancelada: só a categoria e o centro de custo podem mudar.
          </Text>
        )}
        {!conta && (
          <Select label={config.pessoa.rotulo} data={apoio.pessoas} searchable nothingFoundMessage="Nada encontrado" data-autofocus {...form.getInputProps('pessoaId')} />
        )}
        <TextInput label="Descrição" disabled={soClassificacao} {...form.getInputProps('descricao')} />
        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <CampoMoeda label={parcelado ? 'Valor total' : 'Valor'} disabled={soClassificacao} {...form.getInputProps('valor')} />
          {!conta && (
            <NumberInput label="Parcelas" min={1} max={120} allowDecimal={false} {...form.getInputProps('parcelas')} />
          )}
          <CampoData label="Emissão" disabled={soClassificacao} {...form.getInputProps('dataEmissao')} />
          <CampoData
            label={parcelado ? 'Vencimento da 1ª parcela' : 'Vencimento'}
           
            disabled={soClassificacao}
            {...form.getInputProps('dataVencimento')}
          />
        </SimpleGrid>
        {parcelado && Number(form.values.valor) > 0 && (
          <Text size="sm" c="dimmed">
            {form.values.parcelas} parcelas mensais de cerca de {moeda(Number(form.values.valor) / form.values.parcelas)}.
          </Text>
        )}
        <Select label="Categoria" description="Opcional" data={apoio.categorias} searchable clearable {...form.getInputProps('planoContaId')} />
        <Select label="Centro de custo" description="Opcional" data={apoio.centros} searchable clearable {...form.getInputProps('centroCustoId')} />
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

function FormBaixa({ config, conta, aoFechar }: { config: ConfigContas; conta: ContaFinanceira; aoFechar: () => void }) {
  const apoio = useApoio(config);
  const invalidar = useInvalidar(config);
  const form = useForm({
    initialValues: {
      contaBancariaId: '',
      valor: conta.saldo as number | '',
      juros: 0 as number | '',
      multa: 0 as number | '',
      desconto: 0 as number | '',
      data: hoje(),
    },
    validate: {
      contaBancariaId: (v) => (v ? null : 'Escolha a conta bancária'),
      valor: (v) => (Number(v) <= 0 ? 'Informe um valor maior que zero' : Number(v) > conta.saldo ? `No máximo ${moeda(conta.saldo)}` : null),
      data: (v) => (v ? null : 'Informe a data'),
    },
  });
  const total = Number(form.values.valor || 0) + Number(form.values.juros || 0) + Number(form.values.multa || 0) - Number(form.values.desconto || 0);

  const salvar = useMutation({
    mutationFn: (v: typeof form.values) =>
      api.post(`${config.rota}/${conta.id}/baixas`, {
        contaBancariaId: v.contaBancariaId,
        valor: Number(v.valor),
        juros: Number(v.juros || 0),
        multa: Number(v.multa || 0),
        desconto: Number(v.desconto || 0),
        data: v.data,
      }),
    onSuccess: () => {
      invalidar();
      avisarSucesso(Number(form.values.valor) < conta.saldo ? 'Pagamento parcial registrado' : 'Conta quitada');
      aoFechar();
    },
    onError: avisarErro,
  });

  return (
    <form onSubmit={form.onSubmit((v) => salvar.mutate(v))}>
      <Stack>
        <Text size="sm">
          {conta.descricao} · saldo em aberto <b>{moeda(conta.saldo)}</b>
        </Text>
        {apoio.bancos.length === 0 && (
          <Text size="sm" c="red">
            Cadastre uma conta bancária antes de registrar pagamentos.
          </Text>
        )}
        <Select label="Conta bancária" data={apoio.bancos} data-autofocus {...form.getInputProps('contaBancariaId')} />
        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <CampoMoeda label="Valor abatido" description="Menor que o saldo = pagamento parcial" {...form.getInputProps('valor')} />
          <CampoData label="Data do pagamento" {...form.getInputProps('data')} />
          <CampoMoeda label="Juros" {...form.getInputProps('juros')} />
          <CampoMoeda label="Multa" {...form.getInputProps('multa')} />
          <CampoMoeda label="Desconto" {...form.getInputProps('desconto')} />
        </SimpleGrid>
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            Valor movimentado na conta bancária
          </Text>
          <Text fw={700} c={total <= 0 ? 'red' : undefined}>
            {moeda(total)}
          </Text>
        </Group>
        <Group justify="flex-end">
          <Button variant="default" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" loading={salvar.isPending} disabled={total <= 0}>
            Registrar
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

function Detalhe({ config, conta, aoFechar }: { config: ConfigContas; conta: ContaFinanceira; aoFechar: () => void }) {
  const { pode } = useSessao();
  const invalidar = useInvalidar(config);
  const [estornando, setEstornando] = useState<string | null>(null);
  const estornar = useMutation({
    mutationFn: (baixaId: string) => api.delete(`${config.rota}/${conta.id}/baixas/${baixaId}`),
    onSuccess: () => {
      invalidar();
      avisarSucesso('Baixa estornada');
      setEstornando(null);
      aoFechar();
    },
    onError: (erro) => {
      avisarErro(erro);
      setEstornando(null);
    },
  });
  const status = STATUS_CONTA[conta.status];
  const linha = (rotulo: string, valor: ReactNode) => (
    <Group justify="space-between" wrap="nowrap" gap="xl">
      <Text size="sm" c="dimmed">
        {rotulo}
      </Text>
      <Text size="sm" ta="right">
        {valor}
      </Text>
    </Group>
  );

  return (
    <Stack>
      <Group justify="space-between">
        <Text fw={600}>{conta.descricao}</Text>
        <Badge color={status.cor} variant="light">
          {status.rotulo}
        </Badge>
      </Group>
      {linha(config.pessoa.rotulo, conta[config.pessoa.relacao]?.nome)}
      {linha('Emissão', data(conta.dataEmissao))}
      {linha('Vencimento', data(conta.dataVencimento))}
      {conta.totalParcelas && linha('Parcela', `${conta.parcela} de ${conta.totalParcelas}`)}
      {linha('Categoria', conta.planoConta ? `${conta.planoConta.codigo} ${conta.planoConta.nome}` : '—')}
      {linha('Centro de custo', conta.centroCusto?.nome ?? '—')}
      <Divider />
      {linha('Valor', moeda(conta.valor))}
      {linha('Já baixado', moeda(conta.valorBaixado))}
      {linha('Saldo em aberto', <b>{moeda(conta.saldo)}</b>)}
      <Divider label="Pagamentos" labelPosition="left" />
      {conta.baixas.length === 0 ? (
        <Text size="sm" c="dimmed">
          Nenhum pagamento registrado.
        </Text>
      ) : (
        <Table style={{ fontVariantNumeric: 'tabular-nums' }}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Data</Table.Th>
              <Table.Th>Conta</Table.Th>
              <Table.Th ta="right">Movimentado</Table.Th>
              {pode('escreverFinanceiro') && <Table.Th />}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {conta.baixas.map((b) => (
              <Table.Tr key={b.id}>
                <Table.Td>{data(b.data)}</Table.Td>
                <Table.Td>{b.contaBancaria?.nome ?? '—'}</Table.Td>
                <Table.Td ta="right">
                  {moeda(b.valorTotal)}
                  {(b.juros > 0 || b.multa > 0 || b.desconto > 0) && (
                    <Text size="xs" c="dimmed">
                      principal {moeda(b.valor)}
                      {b.juros > 0 && ` + juros ${moeda(b.juros)}`}
                      {b.multa > 0 && ` + multa ${moeda(b.multa)}`}
                      {b.desconto > 0 && ` − desconto ${moeda(b.desconto)}`}
                    </Text>
                  )}
                </Table.Td>
                {pode('escreverFinanceiro') && (
                  <Table.Td ta="right">
                    <Button size="compact-xs" variant="subtle" color="red" onClick={() => setEstornando(b.id)}>
                      Estornar
                    </Button>
                  </Table.Td>
                )}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      <Confirmacao
        aberta={estornando !== null}
        titulo="Estornar pagamento"
        mensagem="O pagamento e a movimentação bancária dele serão desfeitos, e o saldo da conta volta a ficar em aberto."
        rotuloConfirmar="Estornar"
        perigosa
        carregando={estornar.isPending}
        aoConfirmar={() => estornando && estornar.mutate(estornando)}
        aoFechar={() => setEstornando(null)}
      />
    </Stack>
  );
}

export function Contas({ config }: { config: ConfigContas }) {
  const { pode } = useSessao();
  const invalidar = useInvalidar(config);
  const apoio = useApoio(config);
  const [status, setStatus] = useState<FiltroStatus>('EM_ABERTO');
  const [pessoaId, setPessoaId] = useState<string | null>(null);
  const [de, setDe] = useState<string | null>(null);
  const [ate, setAte] = useState<string | null>(null);
  const [editando, setEditando] = useState<ContaFinanceira | 'nova' | null>(null);
  const [baixando, setBaixando] = useState<ContaFinanceira | null>(null);
  const [detalhe, setDetalhe] = useState<ContaFinanceira | null>(null);
  const [cancelando, setCancelando] = useState<ContaFinanceira | null>(null);

  const filtro = consulta({
    [config.pessoa.campo]: pessoaId,
    vencimentoDe: de,
    vencimentoAte: ate,
    status: status === 'EM_ABERTO' || status === 'TODAS' ? undefined : status,
  });
  const lista = useQuery({ queryKey: [config.rota, filtro], queryFn: () => api.get<ContaFinanceira[]>(`${config.rota}${filtro}`) });
  const contas = useMemo(
    () => (lista.data ?? []).filter((c) => status !== 'EM_ABERTO' || c.status === 'ABERTA' || c.status === 'PARCIAL'),
    [lista.data, status],
  );
  const totais = contas.reduce((t, c) => ({ valor: t.valor + c.valor, saldo: t.saldo + c.saldo }), { valor: 0, saldo: 0 });

  const cancelar = useMutation({
    mutationFn: (c: ContaFinanceira) => api.post(`${config.rota}/${c.id}/cancelamento`),
    onSuccess: () => {
      invalidar();
      avisarSucesso('Conta cancelada');
      setCancelando(null);
    },
    onError: (erro) => {
      avisarErro(erro);
      setCancelando(null);
    },
  });

  const escrever = pode('escreverFinanceiro');
  return (
    <>
      <Cabecalho
        titulo={config.titulo}
        descricao={config.descricao}
        acoes={
          escrever && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setEditando('nova')}>
              Nova conta
            </Button>
          )
        }
      />
      <Card withBorder padding={0}>
        <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} p="md">
          <Select label="Situação" data={FILTROS_STATUS} value={status} onChange={(v) => setStatus((v as FiltroStatus) ?? 'EM_ABERTO')} allowDeselect={false} />
          <Select label={config.pessoa.rotulo} data={apoio.pessoas} value={pessoaId} onChange={setPessoaId} searchable clearable placeholder="Todos" />
          <CampoData label="Vencimento de" value={de} onChange={setDe} clearable />
          <CampoData label="até" value={ate} onChange={setAte} clearable />
        </SimpleGrid>
        {lista.isPending ? (
          <Loader m="md" />
        ) : lista.isError ? (
          <ErroCarregamento erro={lista.error} />
        ) : contas.length === 0 ? (
          <Text c="dimmed" p="md">
            Nenhuma conta encontrada com estes filtros.
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={820}>
            <Table highlightOnHover verticalSpacing="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Vencimento</Table.Th>
                  <Table.Th>Descrição</Table.Th>
                  <Table.Th>{config.pessoa.rotulo}</Table.Th>
                  <Table.Th>Categoria</Table.Th>
                  <Table.Th ta="right">Valor</Table.Th>
                  <Table.Th ta="right">Saldo</Table.Th>
                  <Table.Th w={120}>Situação</Table.Th>
                  <Table.Th w={48} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {contas.map((c) => {
                  const atrasada = vencida(c.status, c.dataVencimento);
                  const emAberto = c.status === 'ABERTA' || c.status === 'PARCIAL';
                  return (
                    <Table.Tr key={c.id}>
                      <Table.Td c={atrasada ? 'red.7' : undefined} fw={atrasada ? 600 : undefined}>
                        {data(c.dataVencimento)}
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" style={{ cursor: 'pointer' }} onClick={() => setDetalhe(c)} td="underline" c="teal.8">
                          {c.descricao}
                        </Text>
                      </Table.Td>
                      <Table.Td>{c[config.pessoa.relacao]?.nome}</Table.Td>
                      <Table.Td>
                        {c.planoConta ? (
                          <Text size="sm" lineClamp={1}>
                            {c.planoConta.nome}
                          </Text>
                        ) : (
                          <Text size="sm" c="dimmed">
                            Sem categoria
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td ta="right">{moeda(c.valor)}</Table.Td>
                      <Table.Td ta="right" fw={600}>
                        {moeda(c.saldo)}
                      </Table.Td>
                      <Table.Td>
                        <Badge color={atrasada ? 'red' : STATUS_CONTA[c.status].cor} variant="light">
                          {atrasada ? 'Vencida' : STATUS_CONTA[c.status].rotulo}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Menu position="bottom-end">
                          <Menu.Target>
                            <ActionIcon variant="subtle" color="gray" aria-label={`Ações de ${c.descricao}`}>
                              <IconDots size={18} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item onClick={() => setDetalhe(c)}>Detalhes e pagamentos</Menu.Item>
                            {escrever && emAberto && <Menu.Item onClick={() => setBaixando(c)}>{config.verbo}</Menu.Item>}
                            {escrever && <Menu.Item onClick={() => setEditando(c)}>Editar</Menu.Item>}
                            {escrever && c.status === 'ABERTA' && (
                              <Menu.Item color="red" onClick={() => setCancelando(c)}>
                                Cancelar conta
                              </Menu.Item>
                            )}
                          </Menu.Dropdown>
                        </Menu>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
              <Table.Tfoot>
                <Table.Tr>
                  <Table.Th colSpan={4}>
                    {contas.length} {contas.length === 1 ? 'conta' : 'contas'}
                  </Table.Th>
                  <Table.Th ta="right">{moeda(totais.valor)}</Table.Th>
                  <Table.Th ta="right">{moeda(totais.saldo)}</Table.Th>
                  <Table.Th colSpan={2} />
                </Table.Tr>
              </Table.Tfoot>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>

      <Modal opened={editando !== null} onClose={() => setEditando(null)} title={editando === 'nova' ? 'Nova conta' : 'Editar conta'} size="lg">
        {editando !== null && <FormConta config={config} conta={editando === 'nova' ? null : editando} aoFechar={() => setEditando(null)} />}
      </Modal>
      <Modal opened={baixando !== null} onClose={() => setBaixando(null)} title={`${config.verbo} conta`} size="lg">
        {baixando && <FormBaixa config={config} conta={baixando} aoFechar={() => setBaixando(null)} />}
      </Modal>
      <Drawer opened={detalhe !== null} onClose={() => setDetalhe(null)} title="Detalhes da conta" position="right" size="md">
        {detalhe && <Detalhe config={config} conta={detalhe} aoFechar={() => setDetalhe(null)} />}
      </Drawer>
      <Confirmacao
        aberta={cancelando !== null}
        titulo="Cancelar conta"
        mensagem={`Cancelar "${cancelando?.descricao}"? Ela deixa de aparecer como valor em aberto e não poderá mais receber pagamentos.`}
        rotuloConfirmar="Cancelar conta"
        perigosa
        carregando={cancelar.isPending}
        aoConfirmar={() => cancelando && cancelar.mutate(cancelando)}
        aoFechar={() => setCancelando(null)}
      />
    </>
  );
}

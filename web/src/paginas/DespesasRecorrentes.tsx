import { Alert, Button, Card, Grid, Group, Loader, Modal, NumberInput, SegmentedControl, Select, SimpleGrid, Stack, Table, Tabs, Text, Textarea, TextInput } from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { IconInfoCircle, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useState } from 'react';
import { api, consulta } from '../api/cliente';
import type { AjusteDiaUtil, CentroCusto, DespesaRecorrente, Pessoa, PlanoConta, SituacaoDespesa, TipoValorDespesa } from '../api/tipos';
import { avisarErro, avisarSucesso, Cabecalho, CampoMoeda, Confirmacao, ErroCarregamento, MenuAcoes, SemPermissao } from '../componentes/comum';
import { useSessao } from '../sessao/sessao';
import { data, hoje, mesAno, moeda } from '../util/formato';

const PERIODICIDADES = [
  { value: '1', label: 'Mensal' },
  { value: '2', label: 'Bimestral' },
  { value: '3', label: 'Trimestral' },
  { value: '6', label: 'Semestral' },
  { value: '12', label: 'Anual' },
];
const NOME_PERIODICIDADE: Record<number, string> = { 1: 'Todo mês', 2: 'Bimestral', 3: 'Trimestral', 6: 'Semestral', 12: 'Anual' };

const AJUSTES: { value: AjusteDiaUtil; label: string }[] = [
  { value: 'POSTERGAR', label: 'Paga no dia útil seguinte' },
  { value: 'ANTECIPAR', label: 'Paga no dia útil anterior' },
  { value: 'MANTER', label: 'Mantém a data' },
];

const TIPOS: { value: TipoValorDespesa; label: string }[] = [
  { value: 'FIXO', label: 'Valor fixo' },
  { value: 'ESTIMADO', label: 'Varia todo mês' },
  { value: 'PERCENTUAL_FATURAMENTO', label: '% do faturamento' },
];

/**
 * Despesas típicas de uma pequena empresa, com o tipo de valor, o vencimento e o ajuste de dia útil como costumam
 * ser. O usuário escolhe uma e só confere o valor e o fornecedor.
 */
const MODELOS: { nome: string; tipoValor: TipoValorDespesa; diaVencimento: number; ajuste: AjusteDiaUtil; intervaloMeses?: number; antecedencia?: number; percentual?: number; dica?: string }[] = [
  { nome: 'Aluguel', tipoValor: 'FIXO', diaVencimento: 10, ajuste: 'POSTERGAR' },
  { nome: 'Pró-labore', tipoValor: 'FIXO', diaVencimento: 5, ajuste: 'ANTECIPAR', antecedencia: 5 },
  { nome: 'Salários', tipoValor: 'FIXO', diaVencimento: 5, ajuste: 'ANTECIPAR', antecedencia: 5, dica: 'A CLT exige o pagamento até o 5º dia útil; antecipar evita atraso.' },
  { nome: 'Honorários contábeis', tipoValor: 'FIXO', diaVencimento: 10, ajuste: 'POSTERGAR' },
  { nome: 'Energia elétrica', tipoValor: 'ESTIMADO', diaVencimento: 15, ajuste: 'POSTERGAR' },
  { nome: 'Água e esgoto', tipoValor: 'ESTIMADO', diaVencimento: 15, ajuste: 'POSTERGAR' },
  { nome: 'Internet e telefone', tipoValor: 'FIXO', diaVencimento: 15, ajuste: 'POSTERGAR' },
  { nome: 'Sistemas e assinaturas', tipoValor: 'FIXO', diaVencimento: 10, ajuste: 'MANTER', antecedencia: 3 },
  {
    nome: 'DAS - Simples Nacional',
    tipoValor: 'PERCENTUAL_FATURAMENTO',
    diaVencimento: 20,
    ajuste: 'ANTECIPAR',
    antecedencia: 5,
    percentual: 6,
    dica: 'Use a alíquota efetiva da sua faixa (está no último extrato do PGDAS-D). Imposto que vence em dia sem expediente é pago no dia útil anterior.',
  },
  { nome: 'FGTS', tipoValor: 'ESTIMADO', diaVencimento: 20, ajuste: 'ANTECIPAR', antecedencia: 5 },
  { nome: 'IPTU (parcela única)', tipoValor: 'FIXO', diaVencimento: 10, ajuste: 'POSTERGAR', intervaloMeses: 12 },
  { nome: 'Seguro do estabelecimento', tipoValor: 'FIXO', diaVencimento: 10, ajuste: 'POSTERGAR', intervaloMeses: 12 },
];

/** O valor como o usuário pensa nele: fixo, "por volta de" ou percentual. */
function descreverValor(d: DespesaRecorrente) {
  const proxima = d.proximas[0];
  if (d.tipoValor === 'FIXO') return { principal: moeda(d.valor ?? 0), detalhe: null };
  if (d.tipoValor === 'ESTIMADO') return { principal: `~${moeda(proxima?.valor ?? d.valor ?? 0)}`, detalhe: proxima?.base ?? 'Estimado' };
  return { principal: `${d.percentual?.toLocaleString('pt-BR')}% do faturamento`, detalhe: proxima ? `~${moeda(proxima.valor)} no próximo` : null };
}

function useInvalidar() {
  const queryClient = useQueryClient();
  return () => {
    for (const chave of ['despesas-recorrentes', 'contas-pagar', 'projecao']) queryClient.invalidateQueries({ queryKey: [chave] });
  };
}

function FormDespesa({ despesa, aoFechar }: { despesa: DespesaRecorrente | null; aoFechar: () => void }) {
  const invalidar = useInvalidar();
  const fornecedores = useQuery({ queryKey: ['/fornecedores'], queryFn: () => api.get<Pessoa[]>('/fornecedores') });
  const plano = useQuery({ queryKey: ['/plano-contas'], queryFn: () => api.get<PlanoConta[]>('/plano-contas') });
  const centros = useQuery({ queryKey: ['/centros-custo'], queryFn: () => api.get<CentroCusto[]>('/centros-custo') });
  const [dica, setDica] = useState<string | null>(null);
  const form = useForm({
    initialValues: {
      descricao: despesa?.descricao ?? '',
      fornecedorId: despesa?.fornecedorId ?? (null as string | null),
      tipoValor: despesa?.tipoValor ?? ('FIXO' as TipoValorDespesa),
      valor: despesa?.valor ?? ('' as number | string),
      percentual: despesa?.percentual ?? ('' as number | string),
      intervaloMeses: String(despesa?.intervaloMeses ?? 1),
      diaVencimento: despesa?.diaVencimento ?? (10 as number | string),
      ajusteDiaUtil: despesa?.ajusteDiaUtil ?? ('POSTERGAR' as AjusteDiaUtil),
      inicio: `${despesa?.inicio ?? hoje().slice(0, 7)}-01` as string | null,
      fim: despesa?.fim ? `${despesa.fim}-01` : (null as string | null),
      diasAntecedencia: despesa?.diasAntecedencia ?? (10 as number | string),
      planoContaId: despesa?.planoContaId ?? (null as string | null),
      centroCustoId: despesa?.centroCustoId ?? (null as string | null),
      observacoes: despesa?.observacoes ?? '',
    },
    validate: {
      descricao: (v) => (v.trim() ? null : 'Dê um nome, como "Aluguel da loja"'),
      fornecedorId: (v) => (v ? null : 'Escolha a quem se paga'),
      valor: (v, t) => (t.tipoValor === 'PERCENTUAL_FATURAMENTO' || Number(v) > 0 ? null : 'Informe o valor'),
      percentual: (v, t) => (t.tipoValor !== 'PERCENTUAL_FATURAMENTO' || (Number(v) > 0 && Number(v) <= 100) ? null : 'De 0,01% a 100%'),
      diaVencimento: (v) => (Number(v) >= 1 && Number(v) <= 31 ? null : 'De 1 a 31'),
      diasAntecedencia: (v) => (Number(v) >= 0 && Number(v) <= 60 ? null : 'De 0 a 60 dias'),
      inicio: (v) => (v ? null : 'Informe o primeiro vencimento'),
    },
  });
  const aplicarModelo = (nome: string | null) => {
    const m = MODELOS.find((x) => x.nome === nome);
    if (!m) return;
    form.setValues({
      descricao: m.nome,
      tipoValor: m.tipoValor,
      diaVencimento: m.diaVencimento,
      ajusteDiaUtil: m.ajuste,
      intervaloMeses: String(m.intervaloMeses ?? 1),
      diasAntecedencia: m.antecedencia ?? 10,
      ...(m.percentual && { percentual: m.percentual }),
    });
    setDica(m.dica ?? null);
  };

  const salvar = useMutation({
    mutationFn: (v: typeof form.values) => {
      const corpo = {
        descricao: v.descricao.trim(),
        fornecedorId: v.fornecedorId,
        tipoValor: v.tipoValor,
        valor: v.tipoValor === 'PERCENTUAL_FATURAMENTO' ? null : Number(v.valor),
        percentual: v.tipoValor === 'PERCENTUAL_FATURAMENTO' ? Number(v.percentual) : null,
        intervaloMeses: Number(v.intervaloMeses),
        diaVencimento: Number(v.diaVencimento),
        ajusteDiaUtil: v.ajusteDiaUtil,
        inicio: v.inicio!.slice(0, 7),
        fim: v.fim ? v.fim.slice(0, 7) : null,
        diasAntecedencia: Number(v.diasAntecedencia),
        planoContaId: v.planoContaId,
        centroCustoId: v.centroCustoId,
        observacoes: v.observacoes.trim() || null,
      };
      return despesa ? api.patch<DespesaRecorrente>(`/despesas-recorrentes/${despesa.id}`, corpo) : api.post<DespesaRecorrente>('/despesas-recorrentes', corpo);
    },
    onSuccess: (salva) => {
      invalidar();
      const proxima = salva.proximas[0];
      avisarSucesso(
        proxima
          ? `Salva. Próximo vencimento em ${data(proxima.vencimento)}; a conta a pagar é lançada em ${data(proxima.lancamento)}`
          : 'Despesa salva',
      );
      aoFechar();
    },
    onError: avisarErro,
  });
  const tipo = form.values.tipoValor;

  return (
    <form onSubmit={form.onSubmit((v) => salvar.mutate(v))}>
      <Stack>
        {!despesa && (
          <Select
            label="Começar de um modelo"
            placeholder="Aluguel, energia, DAS... (opcional)"
            data={MODELOS.map((m) => m.nome)}
            searchable
            clearable
            onChange={aplicarModelo}
          />
        )}
        {dica && (
          <Alert color="blue" icon={<IconInfoCircle size={18} />}>
            {dica}
          </Alert>
        )}
        <Grid>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Despesa" placeholder="Aluguel da loja" maxLength={120} data-autofocus {...form.getInputProps('descricao')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              label="Pago a"
              placeholder="Fornecedor"
              data={(fornecedores.data ?? []).filter((f) => f.ativo || f.id === despesa?.fornecedorId).map((f) => ({ value: f.id, label: f.nome }))}
              searchable
              nothingFoundMessage="Cadastre o fornecedor antes"
              {...form.getInputProps('fornecedorId')}
            />
          </Grid.Col>
        </Grid>

        <div>
          <Text size="sm" fw={500} mb={4} c="gray.8">
            Valor
          </Text>
          <SegmentedControl fullWidth data={TIPOS} {...form.getInputProps('tipoValor')} />
        </div>
        {tipo === 'PERCENTUAL_FATURAMENTO' ? (
          <NumberInput
            label="Percentual do faturamento"
            description="Sobre as vendas faturadas no mês anterior ao vencimento; se ele ainda não fechou, pelo maior entre o já faturado e a média dos últimos 3 meses"
            suffix="%"
            decimalSeparator=","
            decimalScale={2}
            min={0}
            max={100}
            {...form.getInputProps('percentual')}
          />
        ) : (
          <CampoMoeda
            label={tipo === 'ESTIMADO' ? 'Valor estimado' : 'Valor'}
            description={tipo === 'ESTIMADO' ? 'Usado até haver contas reais; depois, o ERP prevê pela média das 3 últimas que você corrigir' : undefined}
            {...form.getInputProps('valor')}
          />
        )}

        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <Select label="Repete" data={PERIODICIDADES} allowDeselect={false} {...form.getInputProps('intervaloMeses')} />
          <NumberInput label="Vence no dia" description="31 = último dia do mês" min={1} max={31} allowDecimal={false} {...form.getInputProps('diaVencimento')} />
          <Select label="Em fim de semana ou feriado" data={AJUSTES} allowDeselect={false} {...form.getInputProps('ajusteDiaUtil')} />
        </SimpleGrid>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <MonthPickerInput label="Primeiro vencimento" valueFormat="MM/YYYY" {...form.getInputProps('inicio')} />
          <MonthPickerInput label="Último vencimento" placeholder="Sem fim" valueFormat="MM/YYYY" clearable {...form.getInputProps('fim')} />
          <NumberInput
            label="Lançar a conta"
            description="Dias antes do vencimento"
            min={0}
            max={60}
            allowDecimal={false}
            suffix=" dias antes"
            {...form.getInputProps('diasAntecedencia')}
          />
        </SimpleGrid>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select
            label="Categoria"
            placeholder="Opcional"
            data={(plano.data ?? []).filter((c) => c.tipo === 'DESPESA' && c.aceitaLancamento && c.ativo).map((c) => ({ value: c.id, label: `${c.codigo} ${c.nome}` }))}
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
        <Textarea label="Observações" autosize minRows={1} maxRows={3} maxLength={300} {...form.getInputProps('observacoes')} />

        {despesa && despesa.proximas.length > 0 && (
          <Card withBorder padding="sm" bg="var(--relda-fundo)">
            <Text size="sm" fw={500} mb={4}>
              Próximos vencimentos
            </Text>
            {despesa.proximas.map((p) => (
              <Group key={p.competencia} justify="space-between" gap="xs" wrap="nowrap">
                <Text size="sm">
                  {dayjs(p.vencimento).format('ddd, DD/MM/YYYY')}
                  <Text span size="xs" c="dimmed">
                    {' '}
                    · {p.contaId ? 'lançada' : `lança em ${data(p.lancamento).slice(0, 5)}`}
                  </Text>
                </Text>
                <Text size="sm" fw={500} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p.estimado ? '~' : ''}
                  {moeda(p.valor)}
                </Text>
              </Group>
            ))}
            <Text size="xs" c="dimmed" mt={4}>
              Mudanças valem para as contas ainda não lançadas.
            </Text>
          </Card>
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" loading={salvar.isPending}>
            {despesa ? 'Salvar' : 'Cadastrar despesa'}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

const SITUACOES: { value: SituacaoDespesa; label: string }[] = [
  { value: 'ATIVA', label: 'Ativas' },
  { value: 'PAUSADA', label: 'Pausadas' },
  { value: 'ENCERRADA', label: 'Encerradas' },
];

export function DespesasRecorrentes() {
  const { pode } = useSessao();
  const escrever = pode('escreverFinanceiro');
  const invalidar = useInvalidar();
  const [situacao, setSituacao] = useState<SituacaoDespesa>('ATIVA');
  const [formulario, setFormulario] = useState<{ despesa: DespesaRecorrente | null } | null>(null);
  const [encerrando, setEncerrando] = useState<DespesaRecorrente | null>(null);
  const lista = useQuery({
    queryKey: ['despesas-recorrentes', situacao],
    queryFn: () => api.get<DespesaRecorrente[]>(`/despesas-recorrentes${consulta({ situacao })}`),
    enabled: pode('verSaldos'),
  });
  const acao = useMutation({
    mutationFn: ({ d, rota }: { d: DespesaRecorrente; rota: 'lancamento' | 'pausa' | 'reativacao' | 'encerramento' | 'excluir' }) =>
      rota === 'excluir' ? api.delete(`/despesas-recorrentes/${d.id}`) : api.post(`/despesas-recorrentes/${d.id}/${rota}`),
    onSuccess: (_, { rota }) => {
      avisarSucesso(
        { lancamento: 'Próxima conta lançada em Contas a pagar', pausa: 'Despesa pausada', reativacao: 'Despesa reativada', encerramento: 'Despesa encerrada', excluir: 'Despesa excluída' }[rota],
      );
      setEncerrando(null);
    },
    onError: avisarErro,
    onSettled: invalidar,
  });
  const editar = async (d: DespesaRecorrente) => setFormulario({ despesa: await api.get<DespesaRecorrente>(`/despesas-recorrentes/${d.id}`) });

  if (!pode('verSaldos')) return <SemPermissao titulo="Despesas recorrentes" />;

  // Quanto sai nos próximos 30 dias só com as despesas recorrentes (lançadas ou previstas).
  const limite = dayjs().add(30, 'day').format('YYYY-MM-DD');
  const proximos30 =
    situacao === 'ATIVA'
      ? (lista.data ?? []).flatMap((d) => d.proximas).filter((p) => p.vencimento <= limite).reduce((s, p) => s + Math.round(p.valor * 100), 0) / 100
      : 0;

  return (
    <Stack gap="lg">
      <Cabecalho
        titulo="Despesas recorrentes"
        descricao="Aluguel, salários, energia, impostos: alguns dias antes de cada vencimento, o ERP lança a conta a pagar sozinho, e a projeção do caixa já conta com ela."
        acoes={
          escrever && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setFormulario({ despesa: null })}>
              Nova despesa
            </Button>
          )
        }
      />
      <Card withBorder padding={0}>
        <Group justify="space-between" px="md" pt="xs" wrap="wrap">
          <Tabs value={situacao} onChange={(v) => setSituacao((v as SituacaoDespesa) ?? 'ATIVA')}>
            <Tabs.List style={{ borderBottom: 0 }}>
              {SITUACOES.map((s) => (
                <Tabs.Tab key={s.value} value={s.value}>
                  {s.label}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs>
          {proximos30 > 0 && (
            <Text size="sm" c="dimmed" py={6}>
              Próximos 30 dias: <b style={{ color: 'var(--mantine-color-black)' }}>{moeda(proximos30)}</b>
            </Text>
          )}
        </Group>
        {lista.isPending ? (
          <Loader m="md" size="sm" />
        ) : lista.isError ? (
          <ErroCarregamento erro={lista.error} />
        ) : lista.data.length === 0 ? (
          <Text c="dimmed" p="md" size="sm">
            {situacao === 'ATIVA'
              ? 'Nenhuma despesa recorrente. Cadastre as despesas fixas da empresa (comece por um modelo) para a projeção do caixa mostrar a realidade.'
              : 'Nenhuma despesa aqui.'}
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={820}>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Despesa</Table.Th>
                  <Table.Th w={190} ta="right">
                    Valor
                  </Table.Th>
                  <Table.Th w={170}>Repete</Table.Th>
                  <Table.Th w={210}>Próximo vencimento</Table.Th>
                  <Table.Th w={48} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {lista.data.map((d) => {
                  const valor = descreverValor(d);
                  const proxima = d.proximas[0];
                  return (
                    <Table.Tr key={d.id}>
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          {d.descricao}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {d.fornecedor.nome}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text size="sm">{valor.principal}</Text>
                        {valor.detalhe && (
                          <Text size="xs" c="dimmed">
                            {valor.detalhe}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          {NOME_PERIODICIDADE[d.intervaloMeses]}, dia {d.diaVencimento}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {d.fim ? `até ${mesAno(d.fim)}` : 'sem fim'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {proxima ? (
                          <>
                            <Text size="sm">{dayjs(proxima.vencimento).format('ddd, DD/MM/YYYY')}</Text>
                            <Text size="xs" c="dimmed">
                              {proxima.contaId ? 'Já lançada em Contas a pagar' : `Lança a conta em ${data(proxima.lancamento)}`}
                            </Text>
                          </>
                        ) : (
                          <Text size="sm" c="dimmed">
                            —
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <MenuAcoes
                          rotulo={d.descricao}
                          itens={[
                            escrever && d.situacao !== 'ENCERRADA' && { texto: 'Editar', aoClicar: () => void editar(d).catch(avisarErro) },
                            escrever && d.situacao === 'ATIVA' && { texto: 'Lançar a próxima conta agora', aoClicar: () => acao.mutate({ d, rota: 'lancamento' }) },
                            escrever && d.situacao === 'ATIVA' && { texto: 'Pausar', aoClicar: () => acao.mutate({ d, rota: 'pausa' }) },
                            escrever && d.situacao === 'PAUSADA' && { texto: 'Reativar', aoClicar: () => acao.mutate({ d, rota: 'reativacao' }) },
                            escrever && d.situacao !== 'ENCERRADA' && { texto: 'Encerrar', aoClicar: () => setEncerrando(d), perigosa: true },
                            pode('administrar') && { texto: 'Excluir', aoClicar: () => acao.mutate({ d, rota: 'excluir' }), perigosa: true },
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
      <Text size="xs" c="dimmed">
        <IconInfoCircle size={13} style={{ verticalAlign: -2 }} /> Vencimentos em fim de semana ou feriado bancário nacional são ajustados para o dia útil.
        Feriados estaduais e municipais não entram; ajuste a data na conta, se for o caso. Cancelar uma conta lançada pula aquele mês.
      </Text>

      <Modal
        opened={formulario !== null}
        onClose={() => setFormulario(null)}
        title={formulario?.despesa ? formulario.despesa.descricao : 'Nova despesa recorrente'}
        size="lg"
      >
        {formulario && <FormDespesa despesa={formulario.despesa} aoFechar={() => setFormulario(null)} />}
      </Modal>
      <Confirmacao
        aberta={encerrando !== null}
        titulo={`Encerrar "${encerrando?.descricao ?? ''}"`}
        mensagem="A despesa para de lançar contas a pagar e sai da projeção do caixa. As contas já lançadas continuam. Não dá para reativar depois."
        rotuloConfirmar="Encerrar"
        perigosa
        carregando={acao.isPending}
        aoConfirmar={() => encerrando && acao.mutate({ d: encerrando, rota: 'encerramento' })}
        aoFechar={() => setEncerrando(null)}
      />
    </Stack>
  );
}

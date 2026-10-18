import { Badge, Button, Card, Group, Loader, Modal, SegmentedControl, Select, SimpleGrid, Stack, Table, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconArrowsExchange, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, consulta } from '../api/cliente';
import type { CentroCusto, ContaBancaria, Extrato as DadosExtrato, Movimentacao, OrigemMovimentacao, PlanoConta, TipoMovimentacao } from '../api/tipos';
import {
  avisarErro,
  avisarSucesso,
  Cabecalho,
  CampoData,
  CampoMoeda,
  Confirmacao,
  ErroCarregamento,
  MenuAcoes,
  SemPermissao,
} from '../componentes/comum';
import { useSessao } from '../sessao/sessao';
import { data, hoje, mesDe, moeda } from '../util/formato';

const ORIGENS: Record<OrigemMovimentacao, { rotulo: string; cor: string }> = {
  CONTA_RECEBER: { rotulo: 'Recebimento', cor: 'teal' },
  CONTA_PAGAR: { rotulo: 'Pagamento', cor: 'orange' },
  TRANSFERENCIA: { rotulo: 'Transferência', cor: 'grape' },
  AVULSA: { rotulo: 'Avulsa', cor: 'gray' },
};

/** Tudo que depende do saldo das contas. */
function useInvalidarSaldos() {
  const queryClient = useQueryClient();
  return () => {
    for (const chave of ['extrato', 'saldos', 'fluxo-caixa', 'dre']) queryClient.invalidateQueries({ queryKey: [chave] });
  };
}

function FormAvulsa({ contas, contaId, aoFechar }: { contas: ContaBancaria[]; contaId: string | null; aoFechar: () => void }) {
  const invalidar = useInvalidarSaldos();
  const plano = useQuery({ queryKey: ['/plano-contas'], queryFn: () => api.get<PlanoConta[]>('/plano-contas') });
  const centros = useQuery({ queryKey: ['/centros-custo'], queryFn: () => api.get<CentroCusto[]>('/centros-custo') });
  const form = useForm({
    initialValues: {
      contaBancariaId: contaId,
      tipo: 'SAIDA' as TipoMovimentacao,
      valor: '' as number | '',
      data: hoje(),
      descricao: '',
      planoContaId: null as string | null,
      centroCustoId: null as string | null,
    },
    validate: {
      contaBancariaId: (v) => (v ? null : 'Escolha a conta'),
      valor: (v) => (Number(v) > 0 ? null : 'Informe um valor maior que zero'),
      data: (v) => (v ? null : 'Informe a data'),
      descricao: (v) => (v.trim() ? null : 'Descreva, como "Tarifa de manutenção"'),
    },
  });
  const tipoCategoria = form.values.tipo === 'ENTRADA' ? 'RECEITA' : 'DESPESA';
  const categorias = (plano.data ?? [])
    .filter((c) => c.tipo === tipoCategoria && c.aceitaLancamento && c.ativo)
    .map((c) => ({ value: c.id, label: `${c.codigo} ${c.nome}` }));

  const salvar = useMutation({
    mutationFn: (v: typeof form.values) =>
      api.post('/movimentacoes', {
        contaBancariaId: v.contaBancariaId,
        tipo: v.tipo,
        valor: Number(v.valor),
        data: v.data,
        descricao: v.descricao.trim(),
        planoContaId: v.planoContaId ?? undefined,
        centroCustoId: v.centroCustoId ?? undefined,
      }),
    onSuccess: () => {
      invalidar();
      avisarSucesso('Lançamento registrado');
      aoFechar();
    },
    onError: avisarErro,
  });

  return (
    <form onSubmit={form.onSubmit((v) => salvar.mutate(v))}>
      <Stack>
        <SegmentedControl
          data={[{ value: 'SAIDA', label: 'Saída' }, { value: 'ENTRADA', label: 'Entrada' }]}
          {...form.getInputProps('tipo')}
          onChange={(v) => {
            form.setFieldValue('tipo', v as TipoMovimentacao);
            form.setFieldValue('planoContaId', null);
          }}
        />
        <Select label="Conta" data={contas.map((c) => ({ value: c.id, label: c.nome }))} allowDeselect={false} {...form.getInputProps('contaBancariaId')} />
        <TextInput label="Descrição" placeholder={form.values.tipo === 'SAIDA' ? 'Tarifa de manutenção' : 'Rendimento da aplicação'} data-autofocus {...form.getInputProps('descricao')} />
        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <CampoMoeda label="Valor" {...form.getInputProps('valor')} />
          <CampoData label="Data" {...form.getInputProps('data')} />
        </SimpleGrid>
        <Select label="Categoria" description="Opcional; entra na DRE" data={categorias} searchable clearable {...form.getInputProps('planoContaId')} />
        <Select
          label="Centro de custo"
          description="Opcional"
          data={(centros.data ?? []).filter((c) => c.ativo).map((c) => ({ value: c.id, label: c.nome }))}
          searchable
          clearable
          {...form.getInputProps('centroCustoId')}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" loading={salvar.isPending}>
            Registrar
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

function FormTransferencia({ contas, contaId, aoFechar }: { contas: ContaBancaria[]; contaId: string | null; aoFechar: () => void }) {
  const invalidar = useInvalidarSaldos();
  const form = useForm({
    initialValues: { contaOrigemId: contaId, contaDestinoId: null as string | null, valor: '' as number | '', data: hoje(), descricao: '' },
    validate: {
      contaOrigemId: (v) => (v ? null : 'Escolha a conta de origem'),
      contaDestinoId: (v, c) => (!v ? 'Escolha a conta de destino' : v === c.contaOrigemId ? 'Escolha uma conta diferente da origem' : null),
      valor: (v) => (Number(v) > 0 ? null : 'Informe um valor maior que zero'),
      data: (v) => (v ? null : 'Informe a data'),
    },
  });
  const opcoes = contas.map((c) => ({ value: c.id, label: c.nome }));

  const salvar = useMutation({
    mutationFn: (v: typeof form.values) =>
      api.post('/movimentacoes/transferencias', {
        contaOrigemId: v.contaOrigemId,
        contaDestinoId: v.contaDestinoId,
        valor: Number(v.valor),
        data: v.data,
        descricao: v.descricao.trim() || undefined,
      }),
    onSuccess: () => {
      invalidar();
      avisarSucesso('Transferência registrada');
      aoFechar();
    },
    onError: avisarErro,
  });

  return (
    <form onSubmit={form.onSubmit((v) => salvar.mutate(v))}>
      <Stack>
        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <Select label="De" data={opcoes} allowDeselect={false} {...form.getInputProps('contaOrigemId')} />
          <Select label="Para" data={opcoes} allowDeselect={false} data-autofocus {...form.getInputProps('contaDestinoId')} />
          <CampoMoeda label="Valor" {...form.getInputProps('valor')} />
          <CampoData label="Data" {...form.getInputProps('data')} />
        </SimpleGrid>
        <TextInput label="Descrição" placeholder="Transferência entre contas" {...form.getInputProps('descricao')} />
        <Group justify="flex-end">
          <Button variant="default" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" loading={salvar.isPending}>
            Transferir
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

function Resumo({ rotulo, valor, cor }: { rotulo: string; valor: number; cor?: string }) {
  return (
    <div>
      <Text size="xs" c="dimmed">
        {rotulo}
      </Text>
      <Text fw={700} c={cor ?? (valor < 0 ? 'red.7' : undefined)} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {moeda(valor)}
      </Text>
    </div>
  );
}

export function Extrato() {
  const { pode } = useSessao();
  const invalidar = useInvalidarSaldos();
  const [parametros, setParametros] = useSearchParams();
  const mes = mesDe(hoje());
  const [de, setDe] = useState<string | null>(mes.de);
  const [ate, setAte] = useState<string | null>(mes.ate);
  const [formulario, setFormulario] = useState<'avulsa' | 'transferencia' | null>(null);
  const [removendo, setRemovendo] = useState<Movimentacao | null>(null);

  const contas = useQuery({ queryKey: ['/contas-bancarias'], queryFn: () => api.get<ContaBancaria[]>('/contas-bancarias') });
  const ativas = (contas.data ?? []).filter((c) => c.ativo);
  const contaId = parametros.get('conta') ?? ativas[0]?.id ?? contas.data?.[0]?.id ?? null;
  const conta = contas.data?.find((c) => c.id === contaId);
  // Antes da abertura a conta não existia: o extrato começa no saldo inicial.
  const inicio = de && conta && de < conta.dataSaldoInicial ? conta.dataSaldoInicial : de;

  const extrato = useQuery({
    queryKey: ['extrato', contaId, inicio, ate],
    queryFn: () => api.get<DadosExtrato>(`/movimentacoes/extrato${consulta({ contaBancariaId: contaId, de: inicio, ate })}`),
    enabled: !!conta && pode('verSaldos'),
  });

  const remover = useMutation({
    mutationFn: (m: Movimentacao) => api.delete(`/movimentacoes/${m.id}`),
    onSuccess: (_, m) => {
      invalidar();
      avisarSucesso(m.origem === 'TRANSFERENCIA' ? 'Transferência desfeita nas duas contas' : 'Lançamento removido');
    },
    onError: avisarErro,
    onSettled: () => setRemovendo(null),
  });

  if (!pode('verSaldos')) return <SemPermissao titulo="Extrato bancário" />;
  const escrever = pode('escreverFinanceiro');
  const linhas = extrato.data?.movimentacoes ?? [];
  const entradas = linhas.filter((m) => m.tipo === 'ENTRADA').reduce((s, m) => s + m.valor, 0);
  const saidas = linhas.filter((m) => m.tipo === 'SAIDA').reduce((s, m) => s + m.valor, 0);

  return (
    <>
      <Cabecalho
        titulo="Extrato bancário"
        descricao="Entradas e saídas de cada conta, com o saldo após cada movimentação"
        acoes={
          escrever &&
          ativas.length > 0 && (
            <>
              <Button variant="default" leftSection={<IconArrowsExchange size={16} />} onClick={() => setFormulario('transferencia')} disabled={ativas.length < 2}>
                Transferência
              </Button>
              <Button leftSection={<IconPlus size={16} />} onClick={() => setFormulario('avulsa')}>
                Lançamento avulso
              </Button>
            </>
          )
        }
      />
      <Card withBorder padding={0}>
        <SimpleGrid cols={{ base: 1, sm: 3 }} p="md">
          <Select
            label="Conta"
            data={(contas.data ?? []).map((c) => ({ value: c.id, label: c.ativo ? c.nome : `${c.nome} (inativa)` }))}
            value={contaId}
            onChange={(v) => v && setParametros({ conta: v }, { replace: true })}
            allowDeselect={false}
            placeholder={contas.isPending ? 'Carregando…' : 'Nenhuma conta cadastrada'}
          />
          <CampoData label="De" value={de} onChange={setDe} />
          <CampoData label="Até" value={ate} onChange={setAte} />
        </SimpleGrid>
        {contas.isError ? (
          <ErroCarregamento erro={contas.error} />
        ) : contas.data?.length === 0 ? (
          <Text c="dimmed" p="md">
            Cadastre uma conta bancária para ver o extrato.
          </Text>
        ) : de && ate && ate < de ? (
          <Text c="red" p="md" size="sm">
            A data final precisa ser igual ou posterior à inicial.
          </Text>
        ) : extrato.isPending ? (
          <Loader m="md" />
        ) : extrato.isError ? (
          <ErroCarregamento erro={extrato.error} />
        ) : (
          <>
            <Group px="md" pb="md" gap="xl" wrap="wrap">
              <Resumo rotulo={`Saldo em ${data(extrato.data.de)} (antes)`} valor={extrato.data.saldoAnterior} />
              <Resumo rotulo="Entradas" valor={entradas} cor={entradas > 0 ? 'teal.7' : undefined} />
              <Resumo rotulo="Saídas" valor={saidas} cor={saidas > 0 ? 'red.7' : undefined} />
              <Resumo rotulo={`Saldo em ${data(extrato.data.ate)}`} valor={extrato.data.saldoFinal} />
            </Group>
            {inicio !== de && (
              <Text size="xs" c="dimmed" px="md" pb="sm">
                A conta foi aberta em {data(conta?.dataSaldoInicial)}; o extrato começa nessa data.
              </Text>
            )}
            {linhas.length === 0 ? (
              <Text c="dimmed" p="md">
                Nenhuma movimentação no período.
              </Text>
            ) : (
              <Table.ScrollContainer minWidth={760}>
                <Table highlightOnHover verticalSpacing="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th w={110}>Data</Table.Th>
                      <Table.Th>Descrição</Table.Th>
                      <Table.Th w={160}>Origem</Table.Th>
                      <Table.Th ta="right">Entrada</Table.Th>
                      <Table.Th ta="right">Saída</Table.Th>
                      <Table.Th ta="right">Saldo</Table.Th>
                      {escrever && <Table.Th w={48} />}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {linhas.map((m) => (
                      <Table.Tr key={m.id}>
                        <Table.Td>{data(m.data)}</Table.Td>
                        <Table.Td>
                          <Text size="sm">{m.descricao}</Text>
                          {(m.planoConta || m.centroCusto) && (
                            <Text size="xs" c="dimmed">
                              {[m.planoConta?.nome, m.centroCusto?.nome].filter(Boolean).join(' · ')}
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Badge variant="light" color={ORIGENS[m.origem].cor}>
                            {ORIGENS[m.origem].rotulo}
                          </Badge>
                        </Table.Td>
                        <Table.Td ta="right" c="teal.8">
                          {m.tipo === 'ENTRADA' ? moeda(m.valor) : ''}
                        </Table.Td>
                        <Table.Td ta="right" c="red.7">
                          {m.tipo === 'SAIDA' ? moeda(m.valor) : ''}
                        </Table.Td>
                        <Table.Td ta="right" fw={600} c={m.saldo < 0 ? 'red.7' : undefined}>
                          {moeda(m.saldo)}
                        </Table.Td>
                        {escrever && (
                          <Table.Td>
                            <MenuAcoes
                              rotulo={m.descricao}
                              itens={[
                                (m.origem === 'AVULSA' || m.origem === 'TRANSFERENCIA') && {
                                  texto: m.origem === 'TRANSFERENCIA' ? 'Desfazer transferência' : 'Remover lançamento',
                                  aoClicar: () => setRemovendo(m),
                                  perigosa: true,
                                },
                              ]}
                            />
                          </Table.Td>
                        )}
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </>
        )}
      </Card>
      <Text size="xs" c="dimmed" mt="xs">
        Recebimentos e pagamentos entram aqui pelas baixas das contas; para desfazê-los, estorne a baixa na conta a receber ou a pagar.
      </Text>

      <Modal opened={formulario === 'avulsa'} onClose={() => setFormulario(null)} title="Lançamento avulso" size="lg">
        {formulario === 'avulsa' && <FormAvulsa contas={ativas} contaId={conta?.ativo ? conta.id : null} aoFechar={() => setFormulario(null)} />}
      </Modal>
      <Modal opened={formulario === 'transferencia'} onClose={() => setFormulario(null)} title="Transferência entre contas" size="lg">
        {formulario === 'transferencia' && (
          <FormTransferencia contas={ativas} contaId={conta?.ativo ? conta.id : null} aoFechar={() => setFormulario(null)} />
        )}
      </Modal>
      <Confirmacao
        aberta={removendo !== null}
        titulo={removendo?.origem === 'TRANSFERENCIA' ? 'Desfazer transferência' : 'Remover lançamento'}
        mensagem={
          removendo?.origem === 'TRANSFERENCIA'
            ? 'A saída e a entrada desta transferência serão removidas das duas contas.'
            : `Remover "${removendo?.descricao}" de ${moeda(removendo?.valor ?? 0)}?`
        }
        rotuloConfirmar={removendo?.origem === 'TRANSFERENCIA' ? 'Desfazer' : 'Remover'}
        perigosa
        carregando={remover.isPending}
        aoConfirmar={() => removendo && remover.mutate(removendo)}
        aoFechar={() => setRemovendo(null)}
      />
    </>
  );
}

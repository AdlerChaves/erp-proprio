import { Badge, Button, Card, Group, Loader, Modal, Select, Stack, Switch, Table, Tabs, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/cliente';
import type { PlanoConta, TipoPlanoConta } from '../api/tipos';
import { avisarErro, avisarSucesso, Cabecalho, Confirmacao, ErroCarregamento, MenuAcoes } from '../componentes/comum';
import { useSessao } from '../sessao/sessao';
import { proximoCodigo } from '../util/formato';

const nivel = (codigo: string) => codigo.split('.').length;

/** Nova conta (com o pai já escolhido, ou na raiz) ou alteração de uma existente. */
type Edicao = { conta: PlanoConta } | { tipo: TipoPlanoConta; paiId: string | null };

function FormPlano({ edicao, plano, aoFechar }: { edicao: Edicao; plano: PlanoConta[]; aoFechar: () => void }) {
  const queryClient = useQueryClient();
  const conta = 'conta' in edicao ? edicao.conta : null;
  const tipo = conta?.tipo ?? ('tipo' in edicao ? edicao.tipo : 'RECEITA');
  const temSubcontas = !!conta && plano.some((c) => c.contaPaiId === conta.id);
  const sinteticas = plano.filter((c) => c.tipo === tipo && !c.aceitaLancamento);
  const codigos = plano.map((c) => c.codigo);
  const codigoDoPai = (paiId: string | null) => plano.find((c) => c.id === paiId)?.codigo ?? null;
  const paiInicial = 'paiId' in edicao ? edicao.paiId : null;

  const form = useForm({
    initialValues: {
      contaPaiId: paiInicial,
      codigo: conta?.codigo ?? proximoCodigo(codigoDoPai(paiInicial), codigos),
      nome: conta?.nome ?? '',
      aceitaLancamento: conta?.aceitaLancamento ?? true,
      ativo: conta?.ativo ?? true,
    },
    validate: {
      codigo: (v, c) => {
        if (!/^\d+(\.\d+)*$/.test(v.trim())) return 'Números separados por ponto, como 2.03.06';
        const pai = codigoDoPai(conta ? conta.contaPaiId : c.contaPaiId);
        return pai && !v.trim().startsWith(`${pai}.`) ? `Precisa começar com ${pai}.` : null;
      },
      nome: (v) => (v.trim() ? null : 'Informe o nome'),
    },
  });

  const salvar = useMutation({
    mutationFn: (v: typeof form.values) => {
      const corpo = { codigo: v.codigo.trim(), nome: v.nome.trim(), aceitaLancamento: v.aceitaLancamento, ativo: v.ativo };
      return conta
        ? api.patch(`/plano-contas/${conta.id}`, corpo)
        : api.post('/plano-contas', { ...corpo, tipo, contaPaiId: v.contaPaiId ?? undefined });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/plano-contas'] });
      avisarSucesso(conta ? 'Alterações salvas' : 'Conta criada');
      aoFechar();
    },
    onError: avisarErro,
  });

  return (
    <form onSubmit={form.onSubmit((v) => salvar.mutate(v))}>
      <Stack>
        {!conta && (
          <Select
            label="Dentro de"
            description="Só contas sintéticas (agrupadoras) aceitam subcontas"
            placeholder="Primeiro nível"
            data={sinteticas.map((c) => ({ value: c.id, label: `${c.codigo} ${c.nome}` }))}
            clearable
            searchable
            {...form.getInputProps('contaPaiId')}
            onChange={(paiId) => {
              form.setFieldValue('contaPaiId', paiId);
              form.setFieldValue('codigo', proximoCodigo(codigoDoPai(paiId), codigos));
            }}
          />
        )}
        <Group align="flex-start" wrap="nowrap">
          <TextInput
            label="Código"
            w={130}
            disabled={temSubcontas}
            description={temSubcontas ? 'Não muda com subcontas' : undefined}
            {...form.getInputProps('codigo')}
          />
          <TextInput label="Nome" data-autofocus style={{ flex: 1 }} {...form.getInputProps('nome')} />
        </Group>
        <Switch
          label="Recebe lançamentos (analítica)"
          description={
            temSubcontas
              ? 'Uma conta com subcontas é sempre sintética'
              : 'Desligue para usar como grupo de outras contas (sintética)'
          }
          disabled={temSubcontas}
          {...form.getInputProps('aceitaLancamento', { type: 'checkbox' })}
        />
        <Switch label="Ativa" description="Inativas não aparecem em novos lançamentos" {...form.getInputProps('ativo', { type: 'checkbox' })} />
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

export function PlanoContas() {
  const { pode } = useSessao();
  const queryClient = useQueryClient();
  const [tipo, setTipo] = useState<TipoPlanoConta>('RECEITA');
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [removendo, setRemovendo] = useState<PlanoConta | null>(null);
  const lista = useQuery({ queryKey: ['/plano-contas'], queryFn: () => api.get<PlanoConta[]>('/plano-contas') });

  const remover = useMutation({
    mutationFn: (c: PlanoConta) => api.delete(`/plano-contas/${c.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/plano-contas'] });
      avisarSucesso('Conta removida');
    },
    onError: avisarErro,
    onSettled: () => setRemovendo(null),
  });

  const escrever = pode('escreverCadastros');
  const plano = lista.data ?? [];
  const doTipo = plano.filter((c) => c.tipo === tipo);
  return (
    <>
      <Cabecalho
        titulo="Plano de contas"
        descricao="Categorias de receitas e despesas usadas nos lançamentos e na DRE"
        acoes={
          escrever && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setEdicao({ tipo, paiId: null })}>
              Nova conta
            </Button>
          )
        }
      />
      <Card withBorder padding={0}>
        <Tabs value={tipo} onChange={(v) => setTipo((v as TipoPlanoConta) ?? 'RECEITA')}>
          <Tabs.List px="md" pt="xs">
            <Tabs.Tab value="RECEITA">Receitas</Tabs.Tab>
            <Tabs.Tab value="DESPESA">Despesas</Tabs.Tab>
          </Tabs.List>
        </Tabs>
        {lista.isPending ? (
          <Loader m="md" />
        ) : lista.isError ? (
          <ErroCarregamento erro={lista.error} />
        ) : doTipo.length === 0 ? (
          <Text c="dimmed" p="md">
            Nenhuma conta de {tipo === 'RECEITA' ? 'receita' : 'despesa'}.
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={560}>
            <Table highlightOnHover verticalSpacing={6}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={120}>Código</Table.Th>
                  <Table.Th>Nome</Table.Th>
                  <Table.Th w={130}>Tipo</Table.Th>
                  {escrever && <Table.Th w={48} />}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {doTipo.map((c) => {
                  const sintetica = !c.aceitaLancamento;
                  return (
                    <Table.Tr key={c.id} c={c.ativo ? undefined : 'dimmed'}>
                      <Table.Td ff="monospace">{c.codigo}</Table.Td>
                      <Table.Td>
                        <Group gap="xs" pl={(nivel(c.codigo) - 1) * 20} wrap="nowrap">
                          <Text size="sm" fw={sintetica ? 600 : undefined}>
                            {c.nome}
                          </Text>
                          {!c.ativo && (
                            <Badge size="xs" color="gray" variant="light">
                              Inativa
                            </Badge>
                          )}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" c="dimmed">
                          {sintetica ? 'Grupo (sintética)' : 'Lançamentos'}
                        </Text>
                      </Table.Td>
                      {escrever && (
                        <Table.Td>
                          <MenuAcoes
                            rotulo={c.nome}
                            itens={[
                              sintetica && { texto: 'Nova subconta', aoClicar: () => setEdicao({ tipo: c.tipo, paiId: c.id }) },
                              { texto: 'Editar', aoClicar: () => setEdicao({ conta: c }) },
                              pode('remover') && { texto: 'Remover', aoClicar: () => setRemovendo(c), perigosa: true },
                            ]}
                          />
                        </Table.Td>
                      )}
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>
      <Modal opened={edicao !== null} onClose={() => setEdicao(null)} title={edicao && 'conta' in edicao ? 'Editar conta' : 'Nova conta'}>
        {edicao && <FormPlano edicao={edicao} plano={plano} aoFechar={() => setEdicao(null)} />}
      </Modal>
      <Confirmacao
        aberta={removendo !== null}
        titulo="Remover conta"
        mensagem={`Remover ${removendo?.codigo} ${removendo?.nome}? Contas com subcontas ou com lançamentos não podem ser removidas; nesse caso, desative.`}
        rotuloConfirmar="Remover"
        perigosa
        carregando={remover.isPending}
        aoConfirmar={() => removendo && remover.mutate(removendo)}
        aoFechar={() => setRemovendo(null)}
      />
    </>
  );
}

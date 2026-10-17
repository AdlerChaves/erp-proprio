import { ActionIcon, Badge, Button, Card, Group, Loader, Menu, Modal, Select, Stack, Switch, Table, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconDots, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/cliente';
import type { ContaBancaria, Saldos, TipoContaBancaria } from '../api/tipos';
import { avisarErro, avisarSucesso, Cabecalho, CampoData, CampoMoeda, Confirmacao, ErroCarregamento } from '../componentes/comum';
import { useSessao } from '../sessao/sessao';
import { data, digitos, hoje, moeda } from '../util/formato';

const TIPOS: { value: TipoContaBancaria; label: string }[] = [
  { value: 'CORRENTE', label: 'Conta corrente' },
  { value: 'POUPANCA', label: 'Poupança' },
  { value: 'INVESTIMENTO', label: 'Investimento' },
  { value: 'CAIXA', label: 'Caixa (dinheiro)' },
];
const rotuloTipo = (tipo: TipoContaBancaria) => TIPOS.find((t) => t.value === tipo)?.label ?? tipo;

function FormConta({ conta, aoFechar }: { conta: ContaBancaria | null; aoFechar: () => void }) {
  const queryClient = useQueryClient();
  const form = useForm({
    initialValues: {
      nome: conta?.nome ?? '',
      tipo: (conta?.tipo ?? 'CORRENTE') as TipoContaBancaria,
      banco: conta?.banco ?? '',
      agencia: conta?.agencia ?? '',
      numero: conta?.numero ?? '',
      saldoInicial: conta?.saldoInicial ?? 0,
      dataSaldoInicial: conta?.dataSaldoInicial ?? hoje(),
      ativo: conta?.ativo ?? true,
    },
    validate: {
      nome: (v) => (v.trim() ? null : 'Informe um nome, como "Itaú movimento"'),
      banco: (v, c) => (c.tipo === 'CAIXA' || /^\d{3}$/.test(v) ? null : 'Código do banco com 3 dígitos (ex.: 341)'),
      agencia: (v, c) => (c.tipo === 'CAIXA' || v.trim() ? null : 'Informe a agência'),
      numero: (v, c) => (c.tipo === 'CAIXA' || v.trim() ? null : 'Informe o número da conta'),
      dataSaldoInicial: (v) => (v ? null : 'Informe a data'),
    },
  });
  const caixa = form.values.tipo === 'CAIXA';

  const salvar = useMutation({
    mutationFn: (v: typeof form.values) => {
      const corpo = {
        ...v,
        nome: v.nome.trim(),
        banco: caixa ? undefined : digitos(v.banco),
        agencia: caixa ? undefined : v.agencia.trim(),
        numero: caixa ? undefined : v.numero.trim(),
        saldoInicial: Number(v.saldoInicial) || 0,
      };
      return conta ? api.patch(`/contas-bancarias/${conta.id}`, corpo) : api.post('/contas-bancarias', corpo);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/contas-bancarias'] });
      queryClient.invalidateQueries({ queryKey: ['saldos'] });
      avisarSucesso(conta ? 'Alterações salvas' : 'Conta cadastrada');
      aoFechar();
    },
    onError: avisarErro,
  });

  return (
    <form onSubmit={form.onSubmit((v) => salvar.mutate(v))}>
      <Stack>
        <TextInput label="Nome" placeholder="Itaú movimento" data-autofocus {...form.getInputProps('nome')} />
        <Select label="Tipo" data={TIPOS} allowDeselect={false} {...form.getInputProps('tipo')} />
        {!caixa && (
          <Group grow align="flex-start">
            <TextInput label="Banco" placeholder="341" {...form.getInputProps('banco')} />
            <TextInput label="Agência" {...form.getInputProps('agencia')} />
            <TextInput label="Conta" {...form.getInputProps('numero')} />
          </Group>
        )}
        <Group grow align="flex-start">
          <CampoMoeda label="Saldo inicial" description="Pode ser negativo" allowNegative {...form.getInputProps('saldoInicial')} />
          <CampoData label="Na data" {...form.getInputProps('dataSaldoInicial')} />
        </Group>
        <Switch label="Ativa" {...form.getInputProps('ativo', { type: 'checkbox' })} />
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

export function ContasBancarias() {
  const { pode } = useSessao();
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<ContaBancaria | 'nova' | null>(null);
  const [removendo, setRemovendo] = useState<ContaBancaria | null>(null);
  const contas = useQuery({ queryKey: ['/contas-bancarias'], queryFn: () => api.get<ContaBancaria[]>('/contas-bancarias') });
  const saldos = useQuery({ queryKey: ['saldos'], queryFn: () => api.get<Saldos>('/movimentacoes/saldos'), enabled: pode('verSaldos') });
  const saldoDe = (id: string) => saldos.data?.contas.find((c) => c.contaBancaria.id === id)?.saldo;

  const remover = useMutation({
    mutationFn: (c: ContaBancaria) => api.delete(`/contas-bancarias/${c.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/contas-bancarias'] });
      queryClient.invalidateQueries({ queryKey: ['saldos'] });
      avisarSucesso('Conta removida');
      setRemovendo(null);
    },
    onError: (erro) => {
      avisarErro(erro);
      setRemovendo(null);
    },
  });

  const escrever = pode('escreverCadastros');
  return (
    <>
      <Cabecalho
        titulo="Contas bancárias"
        descricao="Contas e caixas onde o dinheiro entra e sai"
        acoes={
          escrever && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setEditando('nova')}>
              Nova conta
            </Button>
          )
        }
      />
      <Card withBorder padding={0}>
        {contas.isPending ? (
          <Loader m="md" />
        ) : contas.isError ? (
          <ErroCarregamento erro={contas.error} />
        ) : contas.data.length === 0 ? (
          <Text c="dimmed" p="md">
            Nenhuma conta cadastrada. Cadastre ao menos uma para registrar recebimentos e pagamentos.
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={640}>
            <Table highlightOnHover verticalSpacing="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Nome</Table.Th>
                  <Table.Th>Tipo</Table.Th>
                  <Table.Th>Banco / agência / conta</Table.Th>
                  <Table.Th ta="right">Saldo inicial</Table.Th>
                  {pode('verSaldos') && <Table.Th ta="right">Saldo atual</Table.Th>}
                  <Table.Th>Situação</Table.Th>
                  {escrever && <Table.Th w={48} />}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {contas.data.map((c) => {
                  const saldo = saldoDe(c.id);
                  return (
                    <Table.Tr key={c.id}>
                      <Table.Td fw={500}>{c.nome}</Table.Td>
                      <Table.Td>{rotuloTipo(c.tipo)}</Table.Td>
                      <Table.Td>{c.tipo === 'CAIXA' ? '—' : `${c.banco} / ${c.agencia} / ${c.numero}`}</Table.Td>
                      <Table.Td ta="right">
                        {moeda(c.saldoInicial)}
                        <Text size="xs" c="dimmed">
                          em {data(c.dataSaldoInicial)}
                        </Text>
                      </Table.Td>
                      {pode('verSaldos') && (
                        <Table.Td ta="right" fw={600} c={saldo !== undefined && saldo < 0 ? 'red.7' : undefined}>
                          {saldo === undefined ? '—' : moeda(saldo)}
                        </Table.Td>
                      )}
                      <Table.Td>
                        <Badge variant="light" color={c.ativo ? 'teal' : 'gray'}>
                          {c.ativo ? 'Ativa' : 'Inativa'}
                        </Badge>
                      </Table.Td>
                      {escrever && (
                        <Table.Td>
                          <Menu position="bottom-end">
                            <Menu.Target>
                              <ActionIcon variant="subtle" color="gray" aria-label={`Ações de ${c.nome}`}>
                                <IconDots size={18} />
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Item onClick={() => setEditando(c)}>Editar</Menu.Item>
                              {pode('remover') && (
                                <Menu.Item color="red" onClick={() => setRemovendo(c)}>
                                  Remover
                                </Menu.Item>
                              )}
                            </Menu.Dropdown>
                          </Menu>
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
      <Modal opened={editando !== null} onClose={() => setEditando(null)} title={editando === 'nova' ? 'Nova conta' : 'Editar conta'}>
        {editando !== null && <FormConta conta={editando === 'nova' ? null : editando} aoFechar={() => setEditando(null)} />}
      </Modal>
      <Confirmacao
        aberta={removendo !== null}
        titulo="Remover conta"
        mensagem={`Remover ${removendo?.nome}? Contas com movimentações não podem ser removidas; nesse caso, desative.`}
        rotuloConfirmar="Remover"
        perigosa
        carregando={remover.isPending}
        aoConfirmar={() => removendo && remover.mutate(removendo)}
        aoFechar={() => setRemovendo(null)}
      />
    </>
  );
}

import { Badge, Button, Card, Group, Loader, Modal, NumberInput, Progress, Select, SimpleGrid, Stack, Switch, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconCreditCard, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/cliente';
import type { CartaoCredito, ContaBancaria, Pessoa } from '../api/tipos';
import { avisarErro, avisarSucesso, Cabecalho, CampoMoeda, Confirmacao, ErroCarregamento, MenuAcoes, SemPermissao } from '../componentes/comum';
import { useSessao } from '../sessao/sessao';
import { mesAno, moeda } from '../util/formato';

export function FormCartao({ cartao, aoFechar }: { cartao: CartaoCredito | null; aoFechar: () => void }) {
  const queryClient = useQueryClient();
  const contas = useQuery({ queryKey: ['/contas-bancarias'], queryFn: () => api.get<ContaBancaria[]>('/contas-bancarias') });
  const fornecedores = useQuery({ queryKey: ['/fornecedores'], queryFn: () => api.get<Pessoa[]>('/fornecedores') });
  const form = useForm({
    initialValues: {
      nome: cartao?.nome ?? '',
      final: cartao?.final ?? '',
      contaBancariaId: cartao?.contaBancariaId ?? (null as string | null),
      fornecedorId: cartao?.fornecedorId ?? (null as string | null),
      diaFechamento: cartao?.diaFechamento ?? ('' as number | ''),
      diaVencimento: cartao?.diaVencimento ?? ('' as number | ''),
      limite: cartao?.limite ?? ('' as number | ''),
      ativo: cartao?.ativo ?? true,
    },
    validate: {
      nome: (v) => (v.trim() ? null : 'Dê um nome, como "Itaú Empresas Visa"'),
      final: (v) => (!v || /^\d{4}$/.test(v) ? null : '4 dígitos'),
      contaBancariaId: (v) => (v ? null : 'Escolha a conta que paga a fatura'),
      fornecedorId: (v) => (v ? null : 'Escolha o emissor (cadastre o banco em Fornecedores, se preciso)'),
      diaFechamento: (v) => (Number(v) >= 1 && Number(v) <= 31 ? null : 'Dia de 1 a 31'),
      diaVencimento: (v) => (Number(v) >= 1 && Number(v) <= 31 ? null : 'Dia de 1 a 31'),
    },
  });
  const salvar = useMutation({
    mutationFn: (v: typeof form.values) => {
      const corpo = {
        nome: v.nome.trim(),
        final: v.final || null,
        contaBancariaId: v.contaBancariaId,
        fornecedorId: v.fornecedorId,
        diaFechamento: Number(v.diaFechamento),
        diaVencimento: Number(v.diaVencimento),
        limite: v.limite === '' ? null : Number(v.limite),
        ativo: v.ativo,
      };
      return cartao ? api.patch(`/cartoes/${cartao.id}`, corpo) : api.post('/cartoes', corpo);
    },
    onSuccess: () => {
      for (const chave of ['cartoes', 'cartao', 'fatura-cartao', '/contas-pagar', 'fluxo-caixa']) queryClient.invalidateQueries({ queryKey: [chave] });
      avisarSucesso(cartao ? 'Cartão atualizado' : 'Cartão cadastrado');
      aoFechar();
    },
    onError: avisarErro,
  });

  return (
    <form onSubmit={form.onSubmit((v) => salvar.mutate(v))}>
      <Stack>
        <Group grow align="flex-start">
          <TextInput label="Nome" placeholder="Itaú Empresas Visa" data-autofocus style={{ flexGrow: 3 }} {...form.getInputProps('nome')} />
          <TextInput label="Final" placeholder="1234" maxLength={4} {...form.getInputProps('final')} />
        </Group>
        <Select
          label="Conta que paga a fatura"
          data={(contas.data ?? []).filter((c) => c.ativo).map((c) => ({ value: c.id, label: c.nome }))}
          allowDeselect={false}
          {...form.getInputProps('contaBancariaId')}
        />
        <Select
          label="Emissor"
          description="O banco do cartão, cadastrado em Fornecedores: aparece na conta a pagar da fatura"
          data={(fornecedores.data ?? []).filter((f) => f.ativo).map((f) => ({ value: f.id, label: f.nome }))}
          searchable
          nothingFoundMessage="Nenhum fornecedor; cadastre o banco em Fornecedores"
          {...form.getInputProps('fornecedorId')}
        />
        <SimpleGrid cols={{ base: 1, xs: 3 }}>
          <NumberInput label="Dia do fechamento" min={1} max={31} allowDecimal={false} {...form.getInputProps('diaFechamento')} />
          <NumberInput label="Dia do vencimento" min={1} max={31} allowDecimal={false} {...form.getInputProps('diaVencimento')} />
          <CampoMoeda label="Limite" description="Opcional" {...form.getInputProps('limite')} />
        </SimpleGrid>
        <Text size="xs" c="dimmed">
          São os dias padrão. Quando o banco mudar as datas num mês (fim de semana, feriado), ajuste naquela fatura. Compras no dia do
          fechamento entram na fatura seguinte.
          {cartao && ' Mudar os dias aqui atualiza as faturas abertas que você não ajustou à mão.'}
        </Text>
        {cartao && <Switch label="Ativo" {...form.getInputProps('ativo', { type: 'checkbox' })} />}
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

export function Cartoes() {
  const { pode } = useSessao();
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<CartaoCredito | 'novo' | null>(null);
  const [removendo, setRemovendo] = useState<CartaoCredito | null>(null);
  const permitido = pode('verSaldos');
  const lista = useQuery({ queryKey: ['cartoes'], queryFn: () => api.get<CartaoCredito[]>('/cartoes'), enabled: permitido });
  const remover = useMutation({
    mutationFn: (c: CartaoCredito) => api.delete(`/cartoes/${c.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cartoes'] });
      avisarSucesso('Cartão removido');
    },
    onError: avisarErro,
    onSettled: () => setRemovendo(null),
  });

  if (!permitido) return <SemPermissao titulo="Cartões de crédito" />;
  const escrever = pode('escreverFinanceiro');
  return (
    <>
      <Cabecalho
        titulo="Cartões de crédito"
        descricao="Gastos no cartão por fatura; cada fatura vira uma conta a pagar no vencimento"
        acoes={
          escrever && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setEditando('novo')}>
              Novo cartão
            </Button>
          )
        }
      />
      {lista.isPending ? (
        <Loader />
      ) : lista.isError ? (
        <ErroCarregamento erro={lista.error} />
      ) : lista.data.length === 0 ? (
        <Card withBorder>
          <Text c="dimmed">Nenhum cartão cadastrado. Cadastre antes o banco emissor em Fornecedores e a conta bancária que paga a fatura.</Text>
        </Card>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {lista.data.map((c) => {
            const usado = c.limite ? Math.min(100, (c.limiteUsado / c.limite) * 100) : 0;
            return (
              <Card key={c.id} withBorder padding="lg">
                <Group justify="space-between" wrap="nowrap" mb="xs">
                  <Group gap="xs" wrap="nowrap">
                    <IconCreditCard size={22} />
                    <Text fw={600} component={Link} to={`/cartoes/${c.id}`} c="teal.8" td="underline">
                      {c.nome}
                    </Text>
                    {c.final && (
                      <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                        •••• {c.final}
                      </Text>
                    )}
                  </Group>
                  <Group gap={4} wrap="nowrap">
                    {!c.ativo && (
                      <Badge color="gray" variant="light">
                        Inativo
                      </Badge>
                    )}
                    <MenuAcoes
                      rotulo={c.nome}
                      itens={[
                        escrever && { texto: 'Editar', aoClicar: () => setEditando(c) },
                        pode('remover') && { texto: 'Remover', aoClicar: () => setRemovendo(c), perigosa: true },
                      ]}
                    />
                  </Group>
                </Group>
                <Text size="sm" c="dimmed">
                  Fecha dia {c.diaFechamento}, vence dia {c.diaVencimento} · paga por {c.contaBancaria.nome}
                </Text>
                {c.limite !== null && (
                  <Stack gap={4} mt="sm">
                    <Progress value={usado} color={usado > 90 ? 'red' : usado > 70 ? 'yellow' : 'teal'} />
                    <Group justify="space-between">
                      <Text size="xs" c="dimmed">
                        Usado {moeda(c.limiteUsado)}
                      </Text>
                      <Text size="xs" fw={600}>
                        Disponível {moeda(c.limiteDisponivel ?? 0)}
                      </Text>
                    </Group>
                  </Stack>
                )}
                <Button component={Link} to={`/cartoes/${c.id}`} variant="light" size="xs" mt="md">
                  Fatura de {mesAno(c.faturaAtual)}
                </Button>
              </Card>
            );
          })}
        </SimpleGrid>
      )}
      <Modal opened={editando !== null} onClose={() => setEditando(null)} title={editando === 'novo' ? 'Novo cartão' : 'Editar cartão'} size="lg">
        {editando !== null && <FormCartao cartao={editando === 'novo' ? null : editando} aoFechar={() => setEditando(null)} />}
      </Modal>
      <Confirmacao
        aberta={removendo !== null}
        titulo="Remover cartão"
        mensagem={`Remover ${removendo?.nome}? Cartões com lançamentos não podem ser removidos; nesse caso, desative.`}
        rotuloConfirmar="Remover"
        perigosa
        carregando={remover.isPending}
        aoConfirmar={() => removendo && remover.mutate(removendo)}
        aoFechar={() => setRemovendo(null)}
      />
    </>
  );
}

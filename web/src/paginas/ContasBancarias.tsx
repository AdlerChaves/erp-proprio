import { Button, Group, Modal, Select, Stack, Switch, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/cliente';
import type { ContaBancaria, Saldos, TipoContaBancaria } from '../api/tipos';
import { avisarErro, avisarSucesso, Cabecalho, CampoData, CampoMoeda, Confirmacao, EstadoVazio, MenuAcoes, SituacaoAtivo, Valor } from '../componentes/comum';
import { Corta, TabelaDados } from '../componentes/TabelaDados';
import { useSessao } from '../sessao/sessao';
import { data, digitos, hoje } from '../util/formato';

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
      // O saldo inicial entra nos saldos, no fluxo de caixa e no extrato.
      for (const chave of ['/contas-bancarias', 'saldos', 'fluxo-caixa', 'extrato']) queryClient.invalidateQueries({ queryKey: [chave] });
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
  const navegar = useNavigate();
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
  const comAcoes = escrever || pode('verSaldos');
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
      <TabelaDados<ContaBancaria>
        linhas={contas.data}
        erro={contas.error}
        aoTentarDeNovo={() => contas.refetch()}
        chave={(c) => c.id}
        contagem={['conta', 'contas']}
        larguraMinima={680}
        aoClicarLinha={escrever ? setEditando : undefined}
        vazio={
          <EstadoVazio
            mensagem="Nenhuma conta cadastrada. Cadastre ao menos uma para registrar recebimentos e pagamentos."
            acao={
              escrever && (
                <Button variant="default" size="xs" leftSection={<IconPlus size={14} />} onClick={() => setEditando('nova')}>
                  Nova conta
                </Button>
              )
            }
          />
        }
        colunas={[
          { id: 'nome', titulo: 'Nome', ordenar: (c) => c.nome, celula: (c) => <Corta>{c.nome}</Corta> },
          { id: 'tipo', titulo: 'Tipo', largura: 140, ordenar: (c) => rotuloTipo(c.tipo), celula: (c) => rotuloTipo(c.tipo) },
          {
            id: 'banco',
            titulo: 'Banco / agência / conta',
            celula: (c) => (c.tipo === 'CAIXA' ? '—' : <Corta>{`${c.banco} / ${c.agencia} / ${c.numero}`}</Corta>),
          },
          {
            id: 'inicial',
            titulo: 'Saldo inicial',
            alinhar: 'right',
            largura: 150,
            ordenar: (c) => c.saldoInicial,
            celula: (c) => (
              <>
                <Valor valor={c.saldoInicial} />
                <Text size="xs" c="dimmed">
                  em {data(c.dataSaldoInicial)}
                </Text>
              </>
            ),
          },
          ...(pode('verSaldos')
            ? [
                {
                  id: 'atual',
                  titulo: 'Saldo atual',
                  alinhar: 'right' as const,
                  largura: 150,
                  ordenar: (c: ContaBancaria) => saldoDe(c.id),
                  celula: (c: ContaBancaria) => {
                    const saldo = saldoDe(c.id);
                    return saldo === undefined ? '—' : <Valor valor={saldo} forte />;
                  },
                },
              ]
            : []),
          {
            id: 'situacao',
            titulo: 'Situação',
            largura: 110,
            ordenar: (c) => (c.ativo ? 'Ativa' : 'Inativa'),
            celula: (c) => <SituacaoAtivo ativo={c.ativo} feminino />,
          },
        ]}
        acoes={
          comAcoes
            ? (c) => (
                <MenuAcoes
                  rotulo={c.nome}
                  itens={[
                    pode('verSaldos') && { texto: 'Ver extrato', aoClicar: () => navegar(`/extrato?conta=${c.id}`) },
                    escrever && { texto: 'Editar', aoClicar: () => setEditando(c) },
                    pode('remover') && { texto: 'Remover', aoClicar: () => setRemovendo(c), perigosa: true },
                  ]}
                />
              )
            : undefined
        }
      />
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

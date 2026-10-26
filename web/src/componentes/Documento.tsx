import { ActionIcon, Badge, Button, Checkbox, Grid, Group, NumberInput, type NumberInputProps, Paper, Select, SimpleGrid, Stack, Table, Text, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMediaQuery } from '@mantine/hooks';
import { IconFileTypePdf, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, baixarArquivo } from '../api/cliente';
import type { CentroCusto, Compra, ContaFinanceira, Empresa, EscopoServico, Pessoa, PlanoConta, Produto, TipoPlanoConta, Venda } from '../api/tipos';
import { data, moeda, qtd, STATUS_CONTA, totalItemCentavos } from '../util/formato';
import { avisarErro, avisarSucesso, CampoData, CampoMoeda } from './comum';

/** Baixa o orçamento, pedido ou pedido de compra em PDF, com o título conforme a situação. */
export function BotaoPdf({ rota, nome }: { rota: string; nome: string }) {
  const [baixando, setBaixando] = useState(false);
  const baixar = () => {
    setBaixando(true);
    baixarArquivo(`${rota}/pdf`, nome)
      .catch(avisarErro)
      .finally(() => setBaixando(false));
  };
  return (
    <Button variant="light" size="xs" leftSection={<IconFileTypePdf size={16} />} loading={baixando} onClick={baixar}>
      PDF
    </Button>
  );
}

/** O que diferencia o formulário de venda do de compra. */
export interface ConfigDocumento {
  rota: '/vendas' | '/compras';
  /** "venda" ou "compra", para mensagens. */
  nome: string;
  pessoa: { campo: 'clienteId' | 'fornecedorId'; rota: '/clientes' | '/fornecedores'; rotulo: string };
  tipoCategoria: TipoPlanoConta;
  preco: { campo: 'precoUnitario' | 'custoUnitario'; rotulo: string; padrao: (p: Produto) => number };
  comDesconto: boolean;
  /** Compras de estoque só aceitam produtos; vendas aceitam serviços. */
  soProdutos: boolean;
  /** "no faturamento" ou "no recebimento". */
  momentoContas: string;
}

/** Quantidade com vírgula decimal e até 3 casas (1,5 kg). */
export function CampoQuantidade(props: NumberInputProps) {
  return <NumberInput decimalSeparator="," thousandSeparator="." decimalScale={3} min={0} hideControls {...props} />;
}

interface LinhaItem {
  chave: string;
  produtoId: string | null;
  quantidade: number | '';
  preco: number | '';
  desconto: number | '';
}

let proximaChave = 0;
const novaLinha = (): LinhaItem => ({ chave: String(++proximaChave), produtoId: null, quantidade: 1, preco: '', desconto: 0 });

const totalDaLinha = (l: LinhaItem) => totalItemCentavos(Number(l.quantidade || 0), Number(l.preco || 0), Number(l.desconto || 0));

type Documento = Venda | Compra;

export function FormDocumento({
  config,
  documento,
  aoFechar,
  aoSalvar,
}: {
  config: ConfigDocumento;
  documento: Documento | null;
  aoFechar: () => void;
  aoSalvar?: (salvo: Documento) => void;
}) {
  const queryClient = useQueryClient();
  // No celular, cada item vira um cartão empilhado em vez de uma linha de tabela.
  const compacto = useMediaQuery('(max-width: 48em)');
  const pessoas = useQuery({ queryKey: [config.pessoa.rota], queryFn: () => api.get<Pessoa[]>(config.pessoa.rota) });
  const produtos = useQuery({ queryKey: ['/produtos'], queryFn: () => api.get<Produto[]>('/produtos') });
  const plano = useQuery({ queryKey: ['/plano-contas'], queryFn: () => api.get<PlanoConta[]>('/plano-contas') });
  const centros = useQuery({ queryKey: ['/centros-custo'], queryFn: () => api.get<CentroCusto[]>('/centros-custo') });
  const venda = config.nome === 'venda' ? (documento as Venda | null) : null;
  const empresa = useQuery({ queryKey: ['/empresas/atual'], queryFn: () => api.get<Empresa>('/empresas/atual'), enabled: config.nome === 'venda' });

  const itensIniciais = (documento?.itens ?? []).map((i) => ({
    chave: String(++proximaChave),
    produtoId: i.produtoId,
    quantidade: i.quantidade,
    preco: 'precoUnitario' in i ? i.precoUnitario : i.custoUnitario,
    desconto: 'desconto' in i ? i.desconto : 0,
  }));
  const form = useForm({
    initialValues: {
      pessoaId: documento ? (documento as unknown as Record<string, string>)[config.pessoa.campo] : (null as string | null),
      dataEmissao: documento?.dataEmissao ?? (null as string | null),
      itens: itensIniciais.length ? itensIniciais : [novaLinha()],
      parcelas: documento?.parcelas ?? 1,
      primeiroVencimento: documento?.primeiroVencimento ?? null,
      planoContaId: documento?.planoContaId ?? null,
      centroCustoId: documento?.centroCustoId ?? null,
      observacoes: documento?.observacoes ?? '',
      escopoServico: venda?.escopoServico ?? (null as EscopoServico | null),
      exibirParcelamento: venda?.exibirParcelamento ?? true,
    },
    validate: {
      pessoaId: (v) => (v ? null : `Escolha o ${config.pessoa.rotulo.toLowerCase()}`),
      itens: {
        produtoId: (v) => (v ? null : 'Escolha o item'),
        quantidade: (v) => (Number(v) > 0 ? null : 'Maior que zero'),
        preco: (v) => (v === '' || Number(v) < 0 ? 'Informe' : null),
        desconto: (v, valores, caminho) => {
          const linha = valores.itens[Number(caminho.split('.')[1])];
          return totalDaLinha({ ...linha, desconto: v }) < 0 ? 'Maior que o item' : null;
        },
      },
      parcelas: (v) => (Number.isInteger(v) && v >= 1 && v <= 120 ? null : 'Entre 1 e 120'),
    },
  });

  const catalogo = (produtos.data ?? []).filter((p) => (p.ativo || form.values.itens.some((l) => l.produtoId === p.id)) && (!config.soProdutos || p.tipo === 'PRODUTO'));
  const opcoesProdutos = catalogo.map((p) => ({ value: p.id, label: `${p.codigo} · ${p.descricao}` }));
  const produtoDe = (id: string | null) => catalogo.find((p) => p.id === id);
  const total = form.values.itens.reduce((s, l) => s + totalDaLinha(l), 0) / 100;
  const temServico = form.values.itens.some((l) => produtoDe(l.produtoId)?.tipo === 'SERVICO');

  const salvar = useMutation({
    mutationFn: ({ valores, status }: { valores: typeof form.values; status?: 'ORCAMENTO' | 'PEDIDO' }) => {
      const corpo = {
        [config.pessoa.campo]: valores.pessoaId,
        ...(valores.dataEmissao && { dataEmissao: valores.dataEmissao }),
        itens: valores.itens.map((l) => ({
          produtoId: l.produtoId,
          quantidade: Number(l.quantidade),
          [config.preco.campo]: Number(l.preco),
          ...(config.comDesconto && { desconto: Number(l.desconto || 0) }),
        })),
        parcelas: valores.parcelas,
        // null limpa o campo na alteração; na criação, a API trata como "não informado".
        primeiroVencimento: valores.primeiroVencimento,
        planoContaId: valores.planoContaId,
        centroCustoId: valores.centroCustoId,
        observacoes: valores.observacoes.trim() || null,
        ...(config.nome === 'venda' && {
          // Sem serviço na venda, não há escopo a informar.
          escopoServico: temServico ? valores.escopoServico : null,
          exibirParcelamento: valores.exibirParcelamento,
        }),
      };
      return documento
        ? api.patch<Documento>(`${config.rota}/${documento.id}`, corpo)
        : api.post<Documento>(config.rota, status ? { ...corpo, status } : corpo);
    },
    onSuccess: (salvo) => {
      // Lista, detalhe aberto ('venda'/'compra') e reservas do estoque.
      for (const chave of [config.rota, config.nome, 'estoque']) queryClient.invalidateQueries({ queryKey: [chave] });
      avisarSucesso(documento ? 'Alterações salvas' : `${config.nome === 'venda' ? 'Venda' : 'Compra'} nº ${salvo.numero} criada`);
      aoSalvar?.(salvo);
      aoFechar();
    },
    onError: avisarErro,
  });

  /** Campos de uma linha de item; no cartão do celular eles ganham rótulo visível. */
  const camposDaLinha = (i: number) => {
    const produto = produtoDe(form.values.itens[i].produtoId);
    const rotulo = (texto: string) => (compacto ? { label: texto } : { 'aria-label': `${texto} do item ${i + 1}` });
    return {
      produto: (
        <Select
          aria-label={`Item ${i + 1}`}
          placeholder="Busque por código ou descrição"
          data={opcoesProdutos}
          searchable
          nothingFoundMessage={config.soProdutos ? 'Nenhum produto (serviços não entram em compras de estoque)' : 'Nada encontrado'}
          {...form.getInputProps(`itens.${i}.produtoId`)}
          onChange={(id) => {
            form.setFieldValue(`itens.${i}.produtoId`, id);
            const escolhido = produtoDe(id);
            if (escolhido) form.setFieldValue(`itens.${i}.preco`, config.preco.padrao(escolhido));
          }}
        />
      ),
      quantidade: (
        <CampoQuantidade
          {...rotulo('Quantidade')}
          rightSection={
            <Text size="xs" c="dimmed">
              {produto?.unidade}
            </Text>
          }
          {...form.getInputProps(`itens.${i}.quantidade`)}
        />
      ),
      preco: <CampoMoeda {...rotulo(config.preco.rotulo)} {...form.getInputProps(`itens.${i}.preco`)} />,
      desconto: config.comDesconto && <CampoMoeda {...rotulo('Desconto')} {...form.getInputProps(`itens.${i}.desconto`)} />,
      remover: (
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={`Remover item ${i + 1}`}
          disabled={form.values.itens.length === 1}
          onClick={() => form.removeListItem('itens', i)}
        >
          <IconTrash size={16} />
        </ActionIcon>
      ),
    };
  };

  const enviar = (status?: 'ORCAMENTO' | 'PEDIDO') => form.onSubmit((valores) => salvar.mutate({ valores, status }))();

  return (
    <Stack>
      <Grid>
        <Grid.Col span={{ base: 12, sm: 8 }}>
          <Select
            label={config.pessoa.rotulo}
            data={(pessoas.data ?? []).filter((p) => p.ativo).map((p) => ({ value: p.id, label: p.nome }))}
            searchable
            nothingFoundMessage="Nada encontrado"
            data-autofocus
            {...form.getInputProps('pessoaId')}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 4 }}>
          <CampoData label="Data" placeholder="Hoje" clearable {...form.getInputProps('dataEmissao')} />
        </Grid.Col>
      </Grid>

      {compacto ? (
        <Stack gap="xs">
          {form.values.itens.map((linha, i) => {
            const campos = camposDaLinha(i);
            return (
              <Paper key={linha.chave} withBorder p="sm">
                <Stack gap="xs">
                  {campos.produto}
                  <SimpleGrid cols={config.comDesconto ? 3 : 2} spacing="xs">
                    {campos.quantidade}
                    {campos.preco}
                    {campos.desconto}
                  </SimpleGrid>
                  <Group justify="space-between">
                    <Text size="sm" fw={500}>
                      {moeda(totalDaLinha(linha) / 100)}
                    </Text>
                    {campos.remover}
                  </Group>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      ) : (
        <Table.ScrollContainer minWidth={config.comDesconto ? 760 : 640}>
          <Table verticalSpacing={4} style={{ fontVariantNumeric: 'tabular-nums' }}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Item</Table.Th>
                <Table.Th w={110}>Quantidade</Table.Th>
                <Table.Th w={140}>{config.preco.rotulo}</Table.Th>
                {config.comDesconto && <Table.Th w={130}>Desconto</Table.Th>}
                <Table.Th w={120} ta="right">
                  Total
                </Table.Th>
                <Table.Th w={40} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {form.values.itens.map((linha, i) => {
                const campos = camposDaLinha(i);
                return (
                  <Table.Tr key={linha.chave}>
                    <Table.Td>{campos.produto}</Table.Td>
                    <Table.Td>{campos.quantidade}</Table.Td>
                    <Table.Td>{campos.preco}</Table.Td>
                    {config.comDesconto && <Table.Td>{campos.desconto}</Table.Td>}
                    <Table.Td ta="right" fw={500}>
                      {moeda(totalDaLinha(linha) / 100)}
                    </Table.Td>
                    <Table.Td>{campos.remover}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <Group justify="space-between">
        <Button variant="subtle" size="compact-sm" leftSection={<IconPlus size={14} />} onClick={() => form.insertListItem('itens', novaLinha())}>
          Adicionar item
        </Button>
        <Text fw={700} size="lg" style={{ fontVariantNumeric: 'tabular-nums' }}>
          Total {moeda(total)}
        </Text>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
        <NumberInput label="Parcelas" min={1} max={120} allowDecimal={false} {...form.getInputProps('parcelas')} />
        <CampoData
          label="1º vencimento"
          placeholder={`À vista, ${config.momentoContas}`}
          clearable
          {...form.getInputProps('primeiroVencimento')}
        />
        <Select
          label="Categoria"
          placeholder="Opcional"
          data={(plano.data ?? [])
            .filter((c) => c.tipo === config.tipoCategoria && c.aceitaLancamento && c.ativo)
            .map((c) => ({ value: c.id, label: `${c.codigo} ${c.nome}` }))}
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
      {form.values.parcelas > 1 && total > 0 && (
        <Text size="xs" c="dimmed">
          {form.values.parcelas} parcelas mensais de cerca de {moeda(total / form.values.parcelas)}, lançadas {config.momentoContas}.
        </Text>
      )}
      <Textarea label="Observações" autosize minRows={1} maxRows={4} maxLength={500} {...form.getInputProps('observacoes')} />
      {config.nome === 'venda' && (empresa.data?.proposta.simularCartao || temServico) && (
        <Paper withBorder p="sm">
          <Text size="sm" fw={500} mb="xs">
            No orçamento em PDF
          </Text>
          <Stack gap="xs">
            {empresa.data?.proposta.simularCartao && (
              <Checkbox
                label="Mostrar as opções de parcelamento no cartão"
                {...form.getInputProps('exibirParcelamento', { type: 'checkbox' })}
              />
            )}
            {/* O escopo marcado aparece nas condições gerais do PDF. */}
            {temServico &&
              (
                [
                  ['MAO_DE_OBRA', 'Serviço somente de mão de obra (material não incluso)'],
                  ['MATERIAL_INCLUSO', 'Material com mão de obra inclusa'],
                ] as const
              ).map(([escopo, rotulo]) => (
                <Checkbox
                  key={escopo}
                  label={rotulo}
                  checked={form.values.escopoServico === escopo}
                  // Um exclui o outro; desmarcar deixa o escopo sem informar.
                  onChange={(e) => form.setFieldValue('escopoServico', e.currentTarget.checked ? escopo : null)}
                />
              ))}
          </Stack>
        </Paper>
      )}

      <Group justify="flex-end">
        <Button variant="default" onClick={aoFechar}>
          Cancelar
        </Button>
        {documento || config.nome !== 'venda' ? (
          <Button loading={salvar.isPending} onClick={() => enviar()}>
            {documento ? 'Salvar' : 'Criar pedido de compra'}
          </Button>
        ) : (
          <>
            <Button variant="light" loading={salvar.isPending} onClick={() => enviar('ORCAMENTO')}>
              Salvar orçamento
            </Button>
            <Button loading={salvar.isPending} onClick={() => enviar('PEDIDO')}>
              Salvar pedido
            </Button>
          </>
        )}
      </Group>
    </Stack>
  );
}

/** Itens de uma venda ou compra, só leitura. */
export function TabelaItens({ documento }: { documento: Documento }) {
  const itens = documento.itens ?? [];
  const comDesconto = itens.some((i) => 'desconto' in i && i.desconto > 0);
  return (
    <Table style={{ fontVariantNumeric: 'tabular-nums' }}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Item</Table.Th>
          <Table.Th ta="right">Qtd.</Table.Th>
          <Table.Th ta="right">Unitário</Table.Th>
          {comDesconto && <Table.Th ta="right">Desconto</Table.Th>}
          <Table.Th ta="right">Total</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {itens.map((i) => (
          <Table.Tr key={i.id}>
            <Table.Td>
              {i.descricao}
              {i.produto?.tipo === 'SERVICO' && (
                <Badge size="xs" variant="outline" color="gray" ml={6}>
                  serviço
                </Badge>
              )}
            </Table.Td>
            <Table.Td ta="right">
              {qtd(i.quantidade)} {i.produto?.unidade}
            </Table.Td>
            <Table.Td ta="right">{moeda('precoUnitario' in i ? i.precoUnitario : i.custoUnitario)}</Table.Td>
            {comDesconto && <Table.Td ta="right">{'desconto' in i && i.desconto > 0 ? `− ${moeda(i.desconto)}` : ''}</Table.Td>}
            <Table.Td ta="right">{moeda(i.total)}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
      <Table.Tfoot>
        <Table.Tr>
          <Table.Th colSpan={comDesconto ? 4 : 3}>Total</Table.Th>
          <Table.Th ta="right">{moeda(documento.total)}</Table.Th>
        </Table.Tr>
      </Table.Tfoot>
    </Table>
  );
}

/** Contas a receber ou a pagar geradas pelo documento. */
export function ContasGeradas({ contas, vazio }: { contas: ContaFinanceira[]; vazio: string }) {
  if (contas.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {vazio}
      </Text>
    );
  }
  return (
    <Table style={{ fontVariantNumeric: 'tabular-nums' }}>
      <Table.Tbody>
        {contas.map((c) => (
          <Table.Tr key={c.id}>
            <Table.Td>{c.totalParcelas ? `${c.parcela}/${c.totalParcelas}` : 'Única'}</Table.Td>
            <Table.Td>vence {data(c.dataVencimento)}</Table.Td>
            <Table.Td ta="right">{moeda(c.valor)}</Table.Td>
            <Table.Td ta="right">
              <Badge variant="light" color={STATUS_CONTA[c.status].cor}>
                {STATUS_CONTA[c.status].rotulo}
              </Badge>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

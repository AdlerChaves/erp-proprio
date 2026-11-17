import { Button, FileButton, Group, Image, Loader, Modal, Paper, SegmentedControl, SimpleGrid, Stack, Switch, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPhoto, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { api } from '../api/cliente';
import type { Produto, TipoProduto } from '../api/tipos';
import { avisarErro, avisarSucesso, Cabecalho, CampoMoeda, Confirmacao, EstadoVazio, MenuAcoes, SituacaoAtivo, Valor } from '../componentes/comum';
import { Corta, TabelaDados } from '../componentes/TabelaDados';
import { CampoServicoNacional } from '../componentes/Fiscal';
import { useSessao } from '../sessao/sessao';
import { lerComoDataUrl, TAMANHO_MAXIMO_IMAGEM } from '../util/arquivo';
import { digitos } from '../util/formato';

const TIPOS: { value: TipoProduto; label: string }[] = [
  { value: 'PRODUTO', label: 'Produto' },
  { value: 'SERVICO', label: 'Serviço' },
];

/**
 * Foto opcional do item, que vai no orçamento em PDF. Fica só no formulário até salvar:
 * `undefined` mantém a atual, `null` remove.
 */
function CampoImagem({ atual, valor, aoMudar }: { atual: string | null; valor: string | null | undefined; aoMudar: (imagem: string | null) => void }) {
  const limpar = useRef<() => void>(null);
  const exibida = valor === undefined ? atual : valor;
  const escolher = async (arquivo: File | null) => {
    limpar.current?.();
    if (!arquivo) return;
    if (!['image/png', 'image/jpeg'].includes(arquivo.type)) return avisarErro(new Error('Use uma imagem PNG ou JPG'));
    if (arquivo.size > TAMANHO_MAXIMO_IMAGEM) return avisarErro(new Error('A imagem deve ter até 400 KB; reduza e tente de novo'));
    try {
      aoMudar(await lerComoDataUrl(arquivo));
    } catch (erro) {
      avisarErro(erro);
    }
  };
  return (
    <Group align="center" gap="md">
      <Paper withBorder w={80} h={80} p={4} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {exibida ? (
          <Image src={exibida} alt="Imagem do item" fit="contain" h="100%" w="100%" />
        ) : (
          <IconPhoto size={28} color="var(--mantine-color-gray-5)" aria-hidden />
        )}
      </Paper>
      <Stack gap={6}>
        <Group gap="xs">
          <FileButton resetRef={limpar} onChange={escolher} accept="image/png,image/jpeg">
            {(props) => (
              <Button {...props} size="xs" variant="light" leftSection={<IconPhoto size={16} />}>
                {exibida ? 'Trocar imagem' : 'Adicionar imagem'}
              </Button>
            )}
          </FileButton>
          {exibida && (
            <Button size="xs" variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={() => aoMudar(null)}>
              Remover
            </Button>
          )}
        </Group>
        <Text size="xs" c="dimmed">
          Opcional. PNG ou JPG, até 400 KB; aparece junto do item no orçamento em PDF.
        </Text>
      </Stack>
    </Group>
  );
}

function FormProduto({ produto, aoFechar }: { produto: Produto | null; aoFechar: () => void }) {
  const queryClient = useQueryClient();
  const imagemAtual = useQuery({
    queryKey: ['/produtos', produto?.id, 'imagem'],
    queryFn: () => api.get<{ imagem: string | null }>(`/produtos/${produto!.id}/imagem`),
    enabled: !!produto,
  });
  const [imagem, setImagem] = useState<string | null | undefined>(undefined);
  const form = useForm({
    initialValues: {
      tipo: (produto?.tipo ?? 'PRODUTO') as TipoProduto,
      codigo: produto?.codigo ?? '',
      descricao: produto?.descricao ?? '',
      unidade: produto?.unidade ?? 'UN',
      precoVenda: produto?.precoVenda ?? ('' as number | ''),
      custo: produto?.custo ?? ('' as number | ''),
      ncm: produto?.ncm ?? '',
      codigoServico: produto?.codigoServico ?? '',
      codigoTributacaoNacional: produto?.codigoTributacaoNacional ?? (null as string | null),
      codigoNbs: produto?.codigoNbs ?? '',
      ativo: produto?.ativo ?? true,
    },
    validate: {
      codigo: (v) => (v.trim() ? null : 'Informe o código interno (SKU)'),
      descricao: (v) => (v.trim() ? null : 'Descreva o item'),
      unidade: (v) => (/^\S{1,6}$/.test(v.trim()) ? null : 'Até 6 letras, como UN, KG, H'),
      precoVenda: (v) => (v !== '' && Number(v) >= 0 ? null : 'Informe o preço de venda'),
      ncm: (v, c) => (c.tipo !== 'PRODUTO' || !v || /^\d{8}$/.test(digitos(v)) ? null : 'O NCM tem 8 dígitos'),
      codigoServico: (v, c) => (c.tipo !== 'SERVICO' || !v || /^\d{2}\.\d{2}$/.test(v.trim()) ? null : 'Formato 00.00, como 01.07'),
      codigoTributacaoNacional: (v, c) =>
        c.tipo !== 'SERVICO' || !v || !c.codigoServico || v.startsWith(c.codigoServico.replace('.', ''))
          ? null
          : `Não corresponde ao item ${c.codigoServico} da LC 116`,
      codigoNbs: (v, c) => (c.tipo !== 'SERVICO' || !v || /^\d{9}$/.test(digitos(v)) ? null : 'O NBS tem 9 dígitos'),
    },
  });
  const servico = form.values.tipo === 'SERVICO';

  const salvar = useMutation({
    mutationFn: async (v: typeof form.values) => {
      const corpo = {
        tipo: v.tipo,
        codigo: v.codigo.trim(),
        descricao: v.descricao.trim(),
        unidade: v.unidade.trim(),
        precoVenda: Number(v.precoVenda),
        // null limpa o campo na alteração. A API recusa NCM em serviço e código de serviço em produto.
        custo: v.custo === '' ? null : Number(v.custo),
        ncm: servico || !v.ncm ? null : digitos(v.ncm),
        codigoServico: !servico || !v.codigoServico ? null : v.codigoServico.trim(),
        codigoTributacaoNacional: servico ? v.codigoTributacaoNacional : null,
        codigoNbs: servico && v.codigoNbs ? digitos(v.codigoNbs) : null,
        ativo: v.ativo,
      };
      const salvo = await (produto ? api.patch<Produto>(`/produtos/${produto.id}`, corpo) : api.post<Produto>('/produtos', corpo));
      if (imagem === undefined) return;
      // O item já foi salvo: se só a imagem falhar, avisa sem prender o formulário (salvar de novo duplicaria o cadastro).
      try {
        await (imagem ? api.put(`/produtos/${salvo.id}/imagem`, { imagem }) : api.delete(`/produtos/${salvo.id}/imagem`));
      } catch (erro) {
        avisarErro(new Error(`Item salvo, mas a imagem não: ${(erro as Error).message}`));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/produtos'] });
      avisarSucesso(produto ? 'Alterações salvas' : 'Item cadastrado');
      aoFechar();
    },
    onError: avisarErro,
  });

  return (
    <form onSubmit={form.onSubmit((v) => salvar.mutate(v))}>
      <Stack>
        <SegmentedControl data={TIPOS} {...form.getInputProps('tipo')} />
        <SimpleGrid cols={{ base: 1, xs: 3 }}>
          <TextInput label="Código" placeholder="SKU-001" data-autofocus {...form.getInputProps('codigo')} />
          <TextInput label="Unidade" placeholder={servico ? 'H' : 'UN'} {...form.getInputProps('unidade')} />
          {servico ? (
            <TextInput label="Código do serviço" description="Item da LC 116, opcional" placeholder="01.07" {...form.getInputProps('codigoServico')} />
          ) : (
            <TextInput label="NCM" description="8 dígitos, opcional" {...form.getInputProps('ncm')} />
          )}
        </SimpleGrid>
        <TextInput label="Descrição" {...form.getInputProps('descricao')} />
        {servico && (
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <CampoServicoNacional
              label="Código de tributação nacional"
              description="Lista nacional da NFS-e; necessário para emitir a nota"
              style={{ gridColumn: 'span 2' }}
              value={form.values.codigoTributacaoNacional}
              onChange={(codigo) => {
                form.setFieldValue('codigoTributacaoNacional', codigo);
                // O código LC 116 (00.00) é o começo do código nacional; preenche se estiver vazio.
                if (codigo && !form.values.codigoServico) form.setFieldValue('codigoServico', `${codigo.slice(0, 2)}.${codigo.slice(2, 4)}`);
              }}
              error={form.errors.codigoTributacaoNacional}
            />
            <TextInput label="NBS" description="9 dígitos, opcional" {...form.getInputProps('codigoNbs')} />
          </SimpleGrid>
        )}
        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <CampoMoeda label="Preço de venda" {...form.getInputProps('precoVenda')} />
          <CampoMoeda label="Custo" description="Opcional" {...form.getInputProps('custo')} />
        </SimpleGrid>
        {produto && imagemAtual.isPending ? (
          <Loader size="sm" />
        ) : (
          <CampoImagem atual={imagemAtual.data?.imagem ?? null} valor={imagem} aoMudar={setImagem} />
        )}
        <Switch label="Ativo" {...form.getInputProps('ativo', { type: 'checkbox' })} />
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

export function Produtos() {
  const { pode } = useSessao();
  const queryClient = useQueryClient();
  const [tipo, setTipo] = useState<'TODOS' | TipoProduto>('TODOS');
  const [editando, setEditando] = useState<Produto | 'novo' | null>(null);
  const [removendo, setRemovendo] = useState<Produto | null>(null);
  const lista = useQuery({ queryKey: ['/produtos'], queryFn: () => api.get<Produto[]>('/produtos') });

  const filtrados = useMemo(() => lista.data?.filter((p) => tipo === 'TODOS' || p.tipo === tipo), [lista.data, tipo]);

  const remover = useMutation({
    mutationFn: (p: Produto) => api.delete(`/produtos/${p.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/produtos'] });
      avisarSucesso('Item removido');
    },
    onError: avisarErro,
    onSettled: () => setRemovendo(null),
  });

  const escrever = pode('escreverProdutos');
  return (
    <>
      <Cabecalho
        titulo="Produtos e serviços"
        descricao="Itens que a empresa vende"
        acoes={
          escrever && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setEditando('novo')}>
              Novo item
            </Button>
          )
        }
      />
      <TabelaDados<Produto>
        linhas={filtrados}
        erro={lista.error}
        aoTentarDeNovo={() => lista.refetch()}
        chave={(p) => p.id}
        contagem={['item', 'itens']}
        placeholderBusca="Buscar código ou descrição"
        textoBusca={(p) => `${p.codigo} ${p.descricao}`}
        ordemInicial={{ coluna: 'descricao', direcao: 'asc' }}
        larguraMinima={760}
        aoClicarLinha={escrever ? setEditando : undefined}
        filtros={
          <SegmentedControl
            value={tipo}
            onChange={(v) => setTipo(v as typeof tipo)}
            aria-label="Tipo"
            data={[
              { value: 'TODOS', label: 'Todos' },
              { value: 'PRODUTO', label: 'Produtos' },
              { value: 'SERVICO', label: 'Serviços' },
            ]}
          />
        }
        vazio={
          <EstadoVazio
            mensagem={tipo === 'TODOS' ? 'Nenhum produto ou serviço cadastrado.' : `Nenhum ${tipo === 'SERVICO' ? 'serviço' : 'produto'} cadastrado.`}
            acao={
              escrever && (
                <Button variant="default" size="xs" leftSection={<IconPlus size={14} />} onClick={() => setEditando('novo')}>
                  Novo item
                </Button>
              )
            }
          />
        }
        colunas={[
          { id: 'codigo', titulo: 'Código', largura: 120, ordenar: (p) => p.codigo, celula: (p) => p.codigo },
          { id: 'descricao', titulo: 'Descrição', ordenar: (p) => p.descricao, celula: (p) => <Corta>{p.descricao}</Corta> },
          {
            id: 'tipo',
            titulo: 'Tipo',
            largura: 100,
            ordenar: (p) => p.tipo,
            celula: (p) => (p.tipo === 'SERVICO' ? 'Serviço' : 'Produto'),
          },
          { id: 'unidade', titulo: 'Unid.', largura: 70, celula: (p) => p.unidade },
          { id: 'preco', titulo: 'Preço', alinhar: 'right', largura: 130, ordenar: (p) => p.precoVenda, celula: (p) => <Valor valor={p.precoVenda} /> },
          {
            id: 'custo',
            titulo: 'Custo',
            alinhar: 'right',
            largura: 130,
            ordenar: (p) => p.custo,
            celula: (p) =>
              p.custo === null ? (
                <Text size="sm" c="dimmed">
                  —
                </Text>
              ) : (
                <Text size="sm" c="dimmed" span>
                  <Valor valor={p.custo} />
                </Text>
              ),
          },
          {
            id: 'situacao',
            titulo: 'Situação',
            largura: 110,
            ordenar: (p) => (p.ativo ? 'Ativo' : 'Inativo'),
            celula: (p) => <SituacaoAtivo ativo={p.ativo} />,
          },
        ]}
        acoes={
          escrever
            ? (p) => (
                <MenuAcoes
                  rotulo={p.descricao}
                  itens={[
                    { texto: 'Editar', aoClicar: () => setEditando(p) },
                    pode('remover') && { texto: 'Remover', aoClicar: () => setRemovendo(p), perigosa: true },
                  ]}
                />
              )
            : undefined
        }
      />
      <Modal opened={editando !== null} onClose={() => setEditando(null)} title={editando === 'novo' ? 'Novo item' : 'Editar item'} size="lg">
        {editando !== null && <FormProduto produto={editando === 'novo' ? null : editando} aoFechar={() => setEditando(null)} />}
      </Modal>
      <Confirmacao
        aberta={removendo !== null}
        titulo="Remover item"
        mensagem={`Remover ${removendo?.descricao}? Para manter o histórico, prefira desativar.`}
        rotuloConfirmar="Remover"
        perigosa
        carregando={remover.isPending}
        aoConfirmar={() => removendo && remover.mutate(removendo)}
        aoFechar={() => setRemovendo(null)}
      />
    </>
  );
}

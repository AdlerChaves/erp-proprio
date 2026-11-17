import { ActionIcon, Button, Divider, Grid, Group, Menu, Modal, Stack, Switch, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconDots, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { api } from '../api/cliente';
import type { DadosCep, DadosCnpj, Pessoa } from '../api/tipos';
import { avisarErro, avisarSucesso, Cabecalho, Confirmacao, EstadoVazio, SituacaoAtivo } from '../componentes/comum';
import { Corta, TabelaDados } from '../componentes/TabelaDados';
import { CampoCep, enderecoDoCep } from '../componentes/Cep';
import { BotaoBuscarCnpj, ResumoCnpj, useBuscaCnpj } from '../componentes/Cnpj';
import { CampoMunicipio } from '../componentes/Fiscal';
import { useSessao, type Permissao } from '../sessao/sessao';
import { digitos, documento, documentoValido } from '../util/formato';

export interface ConfigPessoas {
  rota: '/clientes' | '/fornecedores';
  titulo: string;
  /** Clientes são tomadores na nota de serviço: pedem endereço e inscrição municipal. */
  dadosFiscais?: boolean;
  /** Cliente pode ser cadastrado sem CPF/CNPJ para receber uma proposta; a nota de serviço exige. */
  documentoOpcional?: boolean;
  singular: string;
  permissaoEscrita: Permissao;
}

export const CLIENTES: ConfigPessoas = {
  rota: '/clientes',
  titulo: 'Clientes',
  singular: 'cliente',
  permissaoEscrita: 'escreverClientes',
  dadosFiscais: true,
  documentoOpcional: true,
};
export const FORNECEDORES: ConfigPessoas = {
  rota: '/fornecedores',
  titulo: 'Fornecedores',
  singular: 'fornecedor',
  permissaoEscrita: 'escreverCadastros',
};

/** Algum campo de endereço preenchido. */
const temEndereco = (c: { cep: string; logradouro: string; numero: string; bairro: string; codigoMunicipio: string | null }) =>
  !!(digitos(c.cep) || c.logradouro.trim() || c.numero.trim() || c.bairro.trim() || c.codigoMunicipio);

function FormPessoa({ config, pessoa, aoFechar }: { config: ConfigPessoas; pessoa: Pessoa | null; aoFechar: () => void }) {
  const queryClient = useQueryClient();
  const form = useForm({
    initialValues: {
      nome: pessoa?.nome ?? '',
      documento: pessoa?.documento ? documento(pessoa.documento) : '',
      email: pessoa?.email ?? '',
      telefone: pessoa?.telefone ?? '',
      ativo: pessoa?.ativo ?? true,
      inscricaoMunicipal: pessoa?.inscricaoMunicipal ?? '',
      cep: pessoa?.endereco?.cep.replace(/(\d{5})(\d{3})/, '$1-$2') ?? '',
      logradouro: pessoa?.endereco?.logradouro ?? '',
      numero: pessoa?.endereco?.numero ?? '',
      complemento: pessoa?.endereco?.complemento ?? '',
      bairro: pessoa?.endereco?.bairro ?? '',
      codigoMunicipio: pessoa?.endereco?.codigoMunicipio ?? (null as string | null),
    },
    validate: {
      nome: (v) => (v.trim() ? null : 'Informe o nome'),
      documento: (v) =>
        config.documentoOpcional && !digitos(v)
          ? null
          : ![11, 14].includes(digitos(v).length)
          ? 'CPF (11 dígitos) ou CNPJ (14 dígitos)'
          : documentoValido(v)
            ? null
            : `${digitos(v).length === 11 ? 'CPF' : 'CNPJ'} com dígito verificador errado; confira o número`,
      email: (v) => (!v || /^\S+@\S+\.\S+$/.test(v) ? null : 'E-mail inválido'),
      telefone: (v) => (!v || digitos(v).length >= 8 ? null : 'Telefone incompleto'),
      // O endereço é opcional, mas, se começar a preencher, precisa ficar completo.
      cep: (v, c) => (!temEndereco(c) || digitos(v).length === 8 ? null : 'CEP com 8 dígitos'),
      logradouro: (v, c) => (!temEndereco(c) || v.trim() ? null : 'Informe a rua'),
      numero: (v, c) => (!temEndereco(c) || v.trim() ? null : 'Informe o número (ou S/N)'),
      bairro: (v, c) => (!temEndereco(c) || v.trim() ? null : 'Informe o bairro'),
      codigoMunicipio: (v, c) => (!temEndereco(c) || v ? null : 'Escolha o município'),
    },
  });
  /** Preenche com o que a Receita informa; campos que ela não tem continuam como estavam. */
  const preencher = (d: DadosCnpj) => {
    const atual = form.values;
    const ou = (novo: string | null | undefined, antigo: string) => (novo ? novo : antigo);
    form.setValues({
      nome: d.razaoSocial,
      email: ou(d.email, atual.email),
      telefone: ou(d.telefone, atual.telefone),
      ...(config.dadosFiscais && {
        cep: ou(d.endereco.cep && d.endereco.cep.replace(/(\d{5})(\d{3})/, '$1-$2'), atual.cep),
        logradouro: ou(d.endereco.logradouro, atual.logradouro),
        numero: ou(d.endereco.numero, atual.numero),
        complemento: ou(d.endereco.complemento, atual.complemento),
        bairro: ou(d.endereco.bairro, atual.bairro),
        codigoMunicipio: d.endereco.codigoMunicipio ?? atual.codigoMunicipio,
      }),
    });
  };
  const cnpj = useBuscaCnpj(preencher);
  const numero = useRef<HTMLInputElement>(null);
  /** Rua, bairro e município pelo CEP; o número ninguém informa, então o cursor vai para ele. */
  const preencherCep = (d: DadosCep) => {
    form.setValues(enderecoDoCep(d, form.values));
    if (d.logradouro) numero.current?.focus();
  };

  const salvar = useMutation({
    mutationFn: (v: typeof form.values) => {
      const corpo = {
        nome: v.nome.trim(),
        // Sem documento: no cadastro novo não vai; na edição, null limpa.
        documento: digitos(v.documento) || (pessoa ? null : undefined),
        email: v.email.trim() || undefined,
        telefone: digitos(v.telefone) || undefined,
        ativo: v.ativo,
        ...(config.dadosFiscais && {
          inscricaoMunicipal: v.inscricaoMunicipal.trim() || null,
          endereco: temEndereco(v)
            ? {
                cep: digitos(v.cep),
                logradouro: v.logradouro.trim(),
                numero: v.numero.trim(),
                complemento: v.complemento.trim() || undefined,
                bairro: v.bairro.trim(),
                codigoMunicipio: v.codigoMunicipio,
              }
            : null,
        }),
      };
      return pessoa ? api.patch(`${config.rota}/${pessoa.id}`, corpo) : api.post(config.rota, corpo);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [config.rota] });
      avisarSucesso(pessoa ? 'Alterações salvas' : `${config.singular[0].toUpperCase()}${config.singular.slice(1)} cadastrado`);
      aoFechar();
    },
    onError: avisarErro,
  });

  return (
    <form onSubmit={form.onSubmit((v) => salvar.mutate(v))}>
      <Stack>
        <TextInput label="Nome" data-autofocus {...form.getInputProps('nome')} />
        <TextInput
          label={config.documentoOpcional ? 'CPF ou CNPJ (opcional)' : 'CPF ou CNPJ'}
          description={
            [
              !pessoa && 'Com um CNPJ válido, os dados da Receita Federal são preenchidos sozinhos.',
              config.documentoOpcional && 'Pode ficar em branco para enviar uma proposta; é obrigatório para emitir nota de serviço.',
            ]
              .filter(Boolean)
              .join(' ') || undefined
          }
          {...form.getInputProps('documento')}
          onChange={(e) => {
            form.getInputProps('documento').onChange(e);
            // Num cadastro novo, busca sozinho ao completar o CNPJ; na edição, só pelo botão.
            if (!pessoa) cnpj.automatico(e.currentTarget.value);
          }}
          rightSection={<BotaoBuscarCnpj cnpj={form.values.documento} buscando={cnpj.buscando} aoClicar={() => cnpj.buscar(form.values.documento)} />}
        />
        {cnpj.dados && digitos(form.values.documento) === cnpj.dados.cnpj && <ResumoCnpj dados={cnpj.dados} />}
        <TextInput label="E-mail" type="email" {...form.getInputProps('email')} />
        <TextInput label="Telefone" {...form.getInputProps('telefone')} />
        {config.dadosFiscais && (
          <>
            <Divider label="Para a nota fiscal de serviço (opcional)" labelPosition="left" />
            <Grid>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <CampoCep label="CEP" {...form.getInputProps('cep')} aoEncontrar={preencherCep} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 8 }}>
                <CampoMunicipio label="Município" {...form.getInputProps('codigoMunicipio')} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 8 }}>
                <TextInput label="Rua" {...form.getInputProps('logradouro')} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <TextInput label="Número" ref={numero} {...form.getInputProps('numero')} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <TextInput label="Complemento" {...form.getInputProps('complemento')} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <TextInput label="Bairro" {...form.getInputProps('bairro')} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <TextInput label="Inscrição municipal" {...form.getInputProps('inscricaoMunicipal')} />
              </Grid.Col>
            </Grid>
          </>
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

export function Pessoas({ config }: { config: ConfigPessoas }) {
  const { pode } = useSessao();
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<Pessoa | 'nova' | null>(null);
  const [removendo, setRemovendo] = useState<Pessoa | null>(null);
  const lista = useQuery({ queryKey: [config.rota], queryFn: () => api.get<Pessoa[]>(config.rota) });

  const remover = useMutation({
    mutationFn: (p: Pessoa) => api.delete(`${config.rota}/${p.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [config.rota] });
      avisarSucesso('Removido');
      setRemovendo(null);
    },
    onError: (erro) => {
      avisarErro(erro);
      setRemovendo(null);
    },
  });

  const escrever = pode(config.permissaoEscrita);

  return (
    <>
      <Cabecalho
        titulo={config.titulo}
        acoes={
          escrever && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setEditando('nova')}>
              Novo {config.singular}
            </Button>
          )
        }
      />
      <TabelaDados<Pessoa>
        linhas={lista.data}
        erro={lista.error}
        aoTentarDeNovo={() => lista.refetch()}
        chave={(p) => p.id}
        contagem={[config.singular, config.titulo.toLowerCase()]}
        placeholderBusca="Buscar nome, documento ou e-mail"
        // O documento entra com e sem pontuação: "12.345" e "12345" encontram o mesmo cadastro.
        textoBusca={(p) => [p.nome, p.documento, p.documento && documento(p.documento), p.email, p.telefone].filter(Boolean).join(' ')}
        ordemInicial={{ coluna: 'nome', direcao: 'asc' }}
        larguraMinima={680}
        aoClicarLinha={escrever ? setEditando : undefined}
        vazio={
          <EstadoVazio
            mensagem={`Nenhum ${config.singular} cadastrado.`}
            acao={
              escrever && (
                <Button variant="default" size="xs" leftSection={<IconPlus size={14} />} onClick={() => setEditando('nova')}>
                  Novo {config.singular}
                </Button>
              )
            }
          />
        }
        colunas={[
          { id: 'nome', titulo: 'Nome', ordenar: (p) => p.nome, celula: (p) => <Corta>{p.nome}</Corta> },
          {
            id: 'documento',
            titulo: 'CPF/CNPJ',
            largura: 170,
            ordenar: (p) => p.documento,
            celula: (p) =>
              p.documento ? (
                documento(p.documento)
              ) : (
                <Text size="sm" c="dimmed">
                  Não informado
                </Text>
              ),
          },
          { id: 'email', titulo: 'E-mail', ordenar: (p) => p.email, celula: (p) => <Corta>{p.email ?? ''}</Corta> },
          { id: 'telefone', titulo: 'Telefone', largura: 150, celula: (p) => p.telefone },
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
                <Menu position="bottom-end">
                  <Menu.Target>
                    <ActionIcon variant="subtle" color="gray" aria-label={`Ações de ${p.nome}`}>
                      <IconDots size={18} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item onClick={() => setEditando(p)}>Editar</Menu.Item>
                    {pode('remover') && (
                      <Menu.Item color="red" onClick={() => setRemovendo(p)}>
                        Remover
                      </Menu.Item>
                    )}
                  </Menu.Dropdown>
                </Menu>
              )
            : undefined
        }
      />

      <Modal
        opened={editando !== null}
        onClose={() => setEditando(null)}
        title={editando === 'nova' ? `Novo ${config.singular}` : `Editar ${config.singular}`}
        size={config.dadosFiscais ? 'lg' : 'md'}
      >
        {editando !== null && (
          <FormPessoa config={config} pessoa={editando === 'nova' ? null : editando} aoFechar={() => setEditando(null)} />
        )}
      </Modal>
      <Confirmacao
        aberta={removendo !== null}
        titulo={`Remover ${config.singular}`}
        mensagem={`Remover ${removendo?.nome}? Se houver contas ligadas a ele, a remoção é recusada; nesse caso, desative o cadastro.`}
        rotuloConfirmar="Remover"
        perigosa
        carregando={remover.isPending}
        aoConfirmar={() => removendo && remover.mutate(removendo)}
        aoFechar={() => setRemovendo(null)}
      />
    </>
  );
}

import { Anchor, Box, Button, Center, Paper, PasswordInput, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { EmpresaAcessivel } from '../api/tipos';
import { avisarErro } from '../componentes/comum';
import { useSessao } from '../sessao/sessao';
import { digitos } from '../util/formato';

function Moldura({ titulo, subtitulo, children }: { titulo: string; subtitulo: string; children: ReactNode }) {
  return (
    <Center mih="100vh" bg="gray.0" p="md">
      <Box w="100%" maw={420}>
        <Title order={2} ta="center" c="teal.7">
          Relda ERP
        </Title>
        <Text ta="center" c="dimmed" mb="lg">
          {subtitulo}
        </Text>
        <Paper withBorder shadow="sm" p="xl">
          <Title order={4} mb="md">
            {titulo}
          </Title>
          {children}
        </Paper>
      </Box>
    </Center>
  );
}

export function Login() {
  const { entrar } = useSessao();
  const navegar = useNavigate();
  const [enviando, setEnviando] = useState(false);
  const [empresas, setEmpresas] = useState<EmpresaAcessivel[] | null>(null);
  const form = useForm({
    initialValues: { email: '', senha: '', empresaId: '' },
    validate: {
      email: (v) => (/^\S+@\S+$/.test(v) ? null : 'Informe um e-mail válido'),
      senha: (v) => (v ? null : 'Informe a senha'),
      empresaId: (v) => (empresas && !v ? 'Escolha a empresa' : null),
    },
  });

  const enviar = form.onSubmit(async ({ email, senha, empresaId }) => {
    setEnviando(true);
    try {
      const { escolher } = await entrar(email, senha, empresaId || undefined);
      if (escolher) setEmpresas(escolher);
      else navegar('/');
    } catch (erro) {
      avisarErro(erro);
    } finally {
      setEnviando(false);
    }
  });

  return (
    <Moldura titulo="Entrar" subtitulo="Gestão financeira da sua empresa">
      <form onSubmit={enviar}>
        <Stack>
          <TextInput label="E-mail" type="email" autoComplete="username" {...form.getInputProps('email')} />
          <PasswordInput label="Senha" autoComplete="current-password" {...form.getInputProps('senha')} />
          {empresas && (
            <Select
              label="Empresa"
              description="Seu usuário tem acesso a mais de uma empresa"
              data={empresas.map((e) => ({ value: e.id, label: e.nomeFantasia || e.razaoSocial }))}
              {...form.getInputProps('empresaId')}
            />
          )}
          <Button type="submit" loading={enviando} fullWidth>
            Entrar
          </Button>
          <Text size="sm" ta="center">
            Ainda não tem conta?{' '}
            <Anchor component={Link} to="/cadastro">
              Cadastre sua empresa
            </Anchor>
          </Text>
        </Stack>
      </form>
    </Moldura>
  );
}

export function Cadastro() {
  const { registrar } = useSessao();
  const navegar = useNavigate();
  const [enviando, setEnviando] = useState(false);
  const form = useForm({
    initialValues: { razaoSocial: '', nomeFantasia: '', cnpj: '', nome: '', email: '', senha: '', confirmacao: '' },
    validate: {
      razaoSocial: (v) => (v.trim() ? null : 'Informe a razão social'),
      cnpj: (v) => (digitos(v).length === 14 ? null : 'O CNPJ tem 14 dígitos'),
      nome: (v) => (v.trim() ? null : 'Informe seu nome'),
      email: (v) => (/^\S+@\S+$/.test(v) ? null : 'Informe um e-mail válido'),
      senha: (v) => (v.length >= 8 ? null : 'Use pelo menos 8 caracteres'),
      confirmacao: (v, valores) => (v === valores.senha ? null : 'As senhas não conferem'),
    },
  });

  const enviar = form.onSubmit(async (v) => {
    setEnviando(true);
    try {
      await registrar({
        empresa: { razaoSocial: v.razaoSocial.trim(), nomeFantasia: v.nomeFantasia.trim() || undefined, cnpj: digitos(v.cnpj) },
        usuario: { nome: v.nome.trim(), email: v.email.trim(), senha: v.senha },
      });
      navegar('/');
    } catch (erro) {
      avisarErro(erro);
    } finally {
      setEnviando(false);
    }
  });

  return (
    <Moldura titulo="Cadastrar empresa" subtitulo="Crie a conta da empresa e o seu acesso de administrador">
      <form onSubmit={enviar}>
        <Stack gap="sm">
          <TextInput label="Razão social" {...form.getInputProps('razaoSocial')} />
          <TextInput label="Nome fantasia" description="Opcional" {...form.getInputProps('nomeFantasia')} />
          <TextInput label="CNPJ" placeholder="00.000.000/0000-00" {...form.getInputProps('cnpj')} />
          <TextInput label="Seu nome" {...form.getInputProps('nome')} />
          <TextInput label="E-mail" type="email" autoComplete="username" {...form.getInputProps('email')} />
          <PasswordInput label="Senha" autoComplete="new-password" {...form.getInputProps('senha')} />
          <PasswordInput label="Confirme a senha" autoComplete="new-password" {...form.getInputProps('confirmacao')} />
          <Button type="submit" loading={enviando} fullWidth mt="xs">
            Criar conta
          </Button>
          <Text size="sm" ta="center">
            Já tem conta?{' '}
            <Anchor component={Link} to="/login">
              Entrar
            </Anchor>
          </Text>
        </Stack>
      </form>
    </Moldura>
  );
}

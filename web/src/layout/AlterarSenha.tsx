import { Button, Group, PasswordInput, Stack, Text } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import { avisarErro, avisarSucesso } from '../componentes/comum';
import { useSessao } from '../sessao/sessao';

export function AlterarSenha({ aoFechar }: { aoFechar: () => void }) {
  const { alterarSenha } = useSessao();
  const form = useForm({
    initialValues: { senhaAtual: '', novaSenha: '', confirmacao: '' },
    validate: {
      senhaAtual: (v) => (v ? null : 'Informe a senha atual'),
      novaSenha: (v, c) => (v.length < 8 ? 'Pelo menos 8 caracteres' : v === c.senhaAtual ? 'A nova senha precisa ser diferente da atual' : null),
      confirmacao: (v, c) => (v === c.novaSenha ? null : 'As senhas não conferem'),
    },
  });
  const salvar = useMutation({
    mutationFn: (v: typeof form.values) => alterarSenha(v.senhaAtual, v.novaSenha),
    onSuccess: () => {
      avisarSucesso('Senha alterada. Os outros dispositivos foram desconectados.');
      aoFechar();
    },
    onError: avisarErro,
  });

  return (
    <form onSubmit={form.onSubmit((v) => salvar.mutate(v))}>
      <Stack>
        <PasswordInput label="Senha atual" autoComplete="current-password" data-autofocus {...form.getInputProps('senhaAtual')} />
        <PasswordInput label="Nova senha" description="Mínimo de 8 caracteres; evite senhas óbvias" autoComplete="new-password" {...form.getInputProps('novaSenha')} />
        <PasswordInput label="Repita a nova senha" autoComplete="new-password" {...form.getInputProps('confirmacao')} />
        <Text size="xs" c="dimmed">
          Por segurança, a troca encerra as sessões abertas em outros navegadores e dispositivos. Este continua conectado.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" loading={salvar.isPending}>
            Alterar senha
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

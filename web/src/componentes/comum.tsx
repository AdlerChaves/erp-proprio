import { ActionIcon, Alert, Badge, Button, Group, Menu, Modal, NumberInput, type NumberInputProps, Stack, Text, Title } from '@mantine/core';
import { DateInput, type DateInputProps } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconDots, IconLock } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { lerDataBR } from '../util/formato';

export function Cabecalho({ titulo, descricao, acoes }: { titulo: string; descricao?: string; acoes?: ReactNode }) {
  return (
    <Group justify="space-between" align="flex-end" mb="lg" wrap="wrap">
      <div>
        <Title order={2}>{titulo}</Title>
        {descricao && (
          <Text c="dimmed" size="sm">
            {descricao}
          </Text>
        )}
      </div>
      {acoes && <Group gap="sm">{acoes}</Group>}
    </Group>
  );
}

/** Valor em reais: vírgula decimal, ponto de milhar e sempre duas casas. */
export function CampoMoeda(props: NumberInputProps) {
  return (
    <NumberInput
      prefix="R$ "
      decimalSeparator=","
      thousandSeparator="."
      decimalScale={2}
      fixedDecimalScale
      hideControls
      {...props}
    />
  );
}

/**
 * Data digitada e exibida como dd/mm/aaaa. Sem o dateParser, o Mantine leria "10/11/2026"
 * no formato americano (11 de outubro).
 */
export function CampoData(props: DateInputProps) {
  return <DateInput valueFormat="DD/MM/YYYY" placeholder="dd/mm/aaaa" dateParser={lerDataBR} {...props} />;
}

export function ErroCarregamento({ erro }: { erro: unknown }) {
  return (
    <Alert color="red" icon={<IconAlertCircle size={18} />} title="Não foi possível carregar">
      {(erro as Error)?.message}
    </Alert>
  );
}

/** Para quem abre pelo endereço uma tela que o perfil não acessa; a API recusaria de qualquer forma. */
export function SemPermissao({ titulo }: { titulo: string }) {
  return (
    <>
      <Cabecalho titulo={titulo} />
      <Alert color="gray" icon={<IconLock size={18} />}>
        Seu perfil não tem acesso a esta tela. Peça a um administrador da empresa, se precisar.
      </Alert>
    </>
  );
}

export function SituacaoAtivo({ ativo, feminino = false }: { ativo: boolean; feminino?: boolean }) {
  return (
    <Badge variant="light" color={ativo ? 'teal' : 'gray'}>
      {ativo ? (feminino ? 'Ativa' : 'Ativo') : feminino ? 'Inativa' : 'Inativo'}
    </Badge>
  );
}

/** Menu "⋯" de ações de uma linha; some quando não há nenhuma ação disponível. */
export function MenuAcoes({ rotulo, itens }: { rotulo: string; itens: (false | null | undefined | { texto: string; aoClicar: () => void; perigosa?: boolean })[] }) {
  const visiveis = itens.filter((i) => !!i);
  if (visiveis.length === 0) return null;
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon variant="subtle" color="gray" aria-label={`Ações de ${rotulo}`}>
          <IconDots size={18} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {visiveis.map((i) => (
          <Menu.Item key={i.texto} color={i.perigosa ? 'red' : undefined} onClick={i.aoClicar}>
            {i.texto}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

export const avisarSucesso = (mensagem: string) => notifications.show({ color: 'teal', message: mensagem });
export const avisarErro = (erro: unknown) => notifications.show({ color: 'red', title: 'Erro', message: (erro as Error).message });

interface ConfirmacaoProps {
  aberta: boolean;
  titulo: string;
  mensagem: ReactNode;
  rotuloConfirmar: string;
  perigosa?: boolean;
  carregando?: boolean;
  aoConfirmar: () => void;
  aoFechar: () => void;
}

export function Confirmacao(p: ConfirmacaoProps) {
  return (
    <Modal opened={p.aberta} onClose={p.aoFechar} title={p.titulo} centered>
      <Stack>
        <Text size="sm">{p.mensagem}</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={p.aoFechar}>
            Voltar
          </Button>
          <Button color={p.perigosa ? 'red' : undefined} loading={p.carregando} onClick={p.aoConfirmar}>
            {p.rotuloConfirmar}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

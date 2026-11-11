import { ActionIcon, Alert, Badge, Button, Group, Menu, Modal, NumberInput, type NumberInputProps, Stack, Text, Title } from '@mantine/core';
import { DateInput, type DateInputProps } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconDots, IconLock } from '@tabler/icons-react';
import type { CSSProperties, ReactNode } from 'react';
import { lerDataBR, moeda } from '../util/formato';
import css from './comum.module.css';

/** Barra do topo de cada tela: título, contexto em uma linha e as ações. Fica presa ao topo enquanto a página rola. */
export function Cabecalho({ titulo, descricao, acoes }: { titulo: string; descricao?: ReactNode; acoes?: ReactNode }) {
  return (
    <header className={css.cabecalho}>
      <div className={css.cabecalhoTexto}>
        <Title order={1}>{titulo}</Title>
        {descricao && (
          <Text c="dimmed" size="sm" mt={2}>
            {descricao}
          </Text>
        )}
      </div>
      {acoes && <div className={css.cabecalhoAcoes}>{acoes}</div>}
    </header>
  );
}

/**
 * Valor em reais com algarismos de mesma largura. Negativo fica vermelho, a não ser que `neutro` diga que o sinal
 * não é um problema (ex.: uma saída numa coluna de saídas).
 */
export function Valor({ valor, forte, neutro }: { valor: number; forte?: boolean; neutro?: boolean }) {
  return (
    <Text component="span" inherit className="relda-valor" fw={forte ? 600 : undefined} c={valor < 0 && !neutro ? 'red.9' : undefined}>
      {moeda(valor)}
    </Text>
  );
}

/** Faixa de números do topo de uma tela, com divisórias entre eles. */
export function FaixaMetricas({ children, colunas = 4 }: { children: ReactNode; colunas?: number }) {
  return (
    <div className={css.faixa} style={{ '--colunas': colunas } as CSSProperties}>
      {children}
    </div>
  );
}

export function Metrica({ rotulo, valor, selo, detalhe }: { rotulo: string; valor: ReactNode; selo?: ReactNode; detalhe?: ReactNode }) {
  return (
    <div className={css.metrica}>
      <span className={css.metricaRotulo}>
        {rotulo}
        {selo}
      </span>
      <span className={css.metricaValor}>{valor}</span>
      <span className={css.metricaDetalhe}>{detalhe ?? ' '}</span>
    </div>
  );
}

/** Bloco da tela com título e uma ação à direita. Sem `respiro`, o conteúdo (tabela, lista) encosta nas bordas. */
export function Secao({ titulo, acao, respiro, children }: { titulo: ReactNode; acao?: ReactNode; respiro?: boolean; children: ReactNode }) {
  return (
    <section className={css.secao}>
      <div className={css.secaoCabecalho}>
        <Title order={4}>{titulo}</Title>
        {acao}
      </div>
      <div className={css.secaoCorpo} data-respiro={respiro || undefined}>
        {children}
      </div>
    </section>
  );
}

/** Subtítulo dentro de uma Seção, para dividir o conteúdo (ex.: "Em atraso" abaixo dos próximos vencimentos). */
export function SubSecao({ titulo, acao }: { titulo: ReactNode; acao?: ReactNode }) {
  return (
    <div className={css.secaoCabecalho} style={{ borderTop: '1px solid var(--relda-borda)' }}>
      <Title order={5}>{titulo}</Title>
      {acao}
    </div>
  );
}

/** Quando não há o que mostrar: explica o porquê e oferece o próximo passo. */
export function EstadoVazio({ mensagem, acao }: { mensagem: ReactNode; acao?: ReactNode }) {
  return (
    <div className={css.vazio}>
      <Text size="sm" c="dimmed" maw={360}>
        {mensagem}
      </Text>
      {acao}
    </div>
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

export function ErroCarregamento({ erro, aoTentarDeNovo }: { erro: unknown; aoTentarDeNovo?: () => void }) {
  return (
    <Alert color="red" icon={<IconAlertCircle size={18} />} title="Não foi possível carregar">
      <Stack gap="xs" align="flex-start">
        <span>{(erro as Error)?.message}</span>
        {aoTentarDeNovo && (
          <Button size="xs" variant="default" onClick={aoTentarDeNovo}>
            Tentar de novo
          </Button>
        )}
      </Stack>
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

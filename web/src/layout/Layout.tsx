import { AppShell, Avatar, Burger, Group, Menu, Modal, ScrollArea, Text, UnstyledButton } from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconBuilding,
  IconBuildingBank,
  IconBuildingWarehouse,
  IconChartBar,
  IconCheck,
  IconSelector,
  IconCreditCard,
  IconChecklist,
  IconFileInvoice,
  IconFileSpreadsheet,
  IconHistory,
  IconHome,
  IconKey,
  IconListTree,
  IconLogout,
  IconPackage,
  IconReceipt,
  IconReceiptRefund,
  IconRepeat,
  IconShoppingBag,
  IconShoppingCart,
  IconTargetArrow,
  IconTruck,
  IconUserCog,
  IconUsers,
} from '@tabler/icons-react';
import { useState } from 'react';
import { NavLink as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { EmpresaAcessivel } from '../api/tipos';
import { type Permissao, useSessao } from '../sessao/sessao';
import { AlterarSenha } from './AlterarSenha';
import css from './Layout.module.css';

interface ItemMenu {
  rota: string;
  rotulo: string;
  icone: typeof IconHome;
  /** Sem permissão, o item nem aparece; a tela e a API recusam do mesmo jeito. */
  permissao?: Permissao;
}

const MENU: { grupo?: string; itens: ItemMenu[] }[] = [
  { itens: [{ rota: '/', rotulo: 'Painel', icone: IconHome }] },
  {
    grupo: 'Comercial',
    itens: [
      { rota: '/vendas', rotulo: 'Vendas', icone: IconShoppingBag },
      { rota: '/contratos', rotulo: 'Contratos', icone: IconRepeat },
      { rota: '/compras', rotulo: 'Compras', icone: IconShoppingCart, permissao: 'verSaldos' },
      { rota: '/estoque', rotulo: 'Estoque', icone: IconBuildingWarehouse },
      { rota: '/notas-servico', rotulo: 'Notas de serviço', icone: IconFileInvoice },
    ],
  },
  {
    grupo: 'Financeiro',
    itens: [
      { rota: '/contas-receber', rotulo: 'Contas a receber', icone: IconReceipt },
      { rota: '/contas-pagar', rotulo: 'Contas a pagar', icone: IconReceiptRefund },
      { rota: '/cartoes', rotulo: 'Cartões de crédito', icone: IconCreditCard, permissao: 'verSaldos' },
      { rota: '/extrato', rotulo: 'Extrato bancário', icone: IconFileSpreadsheet, permissao: 'verSaldos' },
      { rota: '/conciliacao', rotulo: 'Conciliação bancária', icone: IconChecklist, permissao: 'verSaldos' },
      { rota: '/dre', rotulo: 'DRE', icone: IconChartBar, permissao: 'verSaldos' },
    ],
  },
  {
    grupo: 'Cadastros',
    itens: [
      { rota: '/clientes', rotulo: 'Clientes', icone: IconUsers },
      { rota: '/fornecedores', rotulo: 'Fornecedores', icone: IconTruck },
      { rota: '/produtos', rotulo: 'Produtos e serviços', icone: IconPackage },
      { rota: '/contas-bancarias', rotulo: 'Contas bancárias', icone: IconBuildingBank },
      { rota: '/plano-contas', rotulo: 'Plano de contas', icone: IconListTree },
      { rota: '/centros-custo', rotulo: 'Centros de custo', icone: IconTargetArrow },
    ],
  },
  {
    grupo: 'Administração',
    itens: [
      { rota: '/empresa', rotulo: 'Empresa', icone: IconBuilding },
      { rota: '/usuarios', rotulo: 'Usuários', icone: IconUserCog, permissao: 'administrar' },
      { rota: '/auditoria', rotulo: 'Auditoria', icone: IconHistory, permissao: 'administrar' },
    ],
  },
];

const PERFIS = { ADMIN: 'Administrador', FINANCEIRO: 'Financeiro', VENDAS: 'Vendas', CONSULTA: 'Consulta' };

const nomeEmpresa = (e: EmpresaAcessivel | undefined) => e?.nomeFantasia || e?.razaoSocial || '';
/** "Marina Albuquerque" → "MA". */
const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .filter((_, i, todas) => i === 0 || i === todas.length - 1)
    .join('')
    .toUpperCase();

/** Selo e nome do produto, no menu e nas telas de entrada (`claro` sobre fundo escuro). */
export function Marca({ claro = false }: { claro?: boolean }) {
  return (
    <Group gap={10} wrap="nowrap">
      <div className={css.selo} data-claro={claro || undefined} aria-hidden>
        R
      </div>
      <Text fw={600} fz={16} lts="-0.01em" c={claro ? 'white' : undefined}>
        Relda
      </Text>
    </Group>
  );
}

export function Layout() {
  const [aberto, { toggle, close }] = useDisclosure();
  const celular = useMediaQuery('(max-width: 48em)');
  const { me, pode, trocarEmpresa, sair } = useSessao();
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const local = useLocation();
  const navegar = useNavigate();
  if (!me) return null;

  const atual = me.empresas.find((e) => e.id === me.empresaId) ?? me.empresas[0];
  const trocar = async (empresaId: string) => {
    if (empresaId === me.empresaId) return;
    try {
      await trocarEmpresa(empresaId);
      navegar('/');
    } catch (erro) {
      notifications.show({ color: 'red', message: (erro as Error).message });
    }
  };

  const sairAgora = async (todos: boolean) => {
    await sair(todos);
    // Avisos da sessão anterior não devem aparecer para quem entrar em seguida.
    notifications.clean();
    navegar('/login');
  };

  const empresa = (
    <>
      <Text size="xs" c="dimmed" lh={1.2}>
        Empresa
      </Text>
      <Text size="sm" fw={500} lineClamp={1} lh={1.35}>
        {nomeEmpresa(atual)}
      </Text>
    </>
  );

  return (
    <AppShell
      header={{ height: 56, collapsed: !celular }}
      navbar={{ width: 256, breakpoint: 'sm', collapsed: { mobile: !aberto } }}
      padding="sm"
      classNames={{ navbar: css.navbar, main: css.main }}
    >
      <AppShell.Header>
        <Group h="100%" px="md" gap="sm" wrap="nowrap">
          <Burger opened={aberto} onClick={toggle} size="sm" aria-label="Abrir menu" />
          <Marca />
        </Group>
      </AppShell.Header>

      <AppShell.Navbar px="sm" pt="md" pb="sm">
        <AppShell.Section px={6} mb="md" visibleFrom="sm">
          <Marca />
        </AppShell.Section>

        <AppShell.Section mb={4}>
          {me.empresas.length > 1 ? (
            <Menu position="bottom-start" width="target">
              <Menu.Target>
                <UnstyledButton className={css.bloco} aria-label="Trocar de empresa">
                  <div style={{ flex: 1, minWidth: 0 }}>{empresa}</div>
                  <IconSelector size={16} color="var(--mantine-color-gray-5)" />
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Trocar de empresa</Menu.Label>
                {me.empresas.map((e) => (
                  <Menu.Item
                    key={e.id}
                    onClick={() => trocar(e.id)}
                    rightSection={e.id === me.empresaId ? <IconCheck size={15} color="var(--mantine-color-teal-7)" /> : null}
                  >
                    <Text size="sm" lineClamp={1}>
                      {nomeEmpresa(e)}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {PERFIS[e.perfil]}
                    </Text>
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          ) : (
            <div className={css.bloco} data-estatico>
              <div style={{ flex: 1, minWidth: 0 }}>{empresa}</div>
            </div>
          )}
        </AppShell.Section>

        <AppShell.Section grow component={ScrollArea} type="scroll" mx={-4} px={4}>
          <nav aria-label="Menu principal">
            {MENU.map(({ grupo, itens }) => {
              const visiveis = itens.filter((i) => !i.permissao || pode(i.permissao));
              if (visiveis.length === 0) return null;
              return (
                <div key={grupo ?? 'inicio'}>
                  {grupo ? <div className={css.grupo}>{grupo}</div> : <div style={{ height: 10 }} />}
                  {visiveis.map((item) => {
                    const ativo = item.rota === '/' ? local.pathname === '/' : local.pathname.startsWith(item.rota);
                    return (
                      <RouterLink
                        key={item.rota}
                        to={item.rota}
                        className={css.item}
                        data-active={ativo || undefined}
                        aria-current={ativo ? 'page' : undefined}
                        onClick={close}
                      >
                        <item.icone size={17} stroke={1.6} />
                        {item.rotulo}
                      </RouterLink>
                    );
                  })}
                </div>
              );
            })}
          </nav>
        </AppShell.Section>

        <AppShell.Section pt="sm">
          <Menu position="top-start" width="target">
            <Menu.Target>
              <UnstyledButton className={css.bloco} aria-label="Menu do usuário">
                <Avatar size={30} radius="xl" color="teal" variant="light">
                  {iniciais(me.usuario.nome)}
                </Avatar>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm" fw={500} lineClamp={1} lh={1.3}>
                    {me.usuario.nome}
                  </Text>
                  <Text size="xs" c="dimmed" lh={1.3}>
                    {PERFIS[me.perfil]}
                  </Text>
                </div>
                <IconSelector size={16} color="var(--mantine-color-gray-5)" />
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{me.usuario.email}</Menu.Label>
              <Menu.Item leftSection={<IconKey size={16} />} onClick={() => setTrocandoSenha(true)}>
                Alterar senha
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item leftSection={<IconLogout size={16} />} onClick={() => sairAgora(false)}>
                Sair
              </Menu.Item>
              <Menu.Item color="red" leftSection={<IconLogout size={16} />} onClick={() => sairAgora(true)}>
                Sair de todos os dispositivos
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <div className={css.folha}>
          <Outlet />
        </div>
      </AppShell.Main>
      <Modal opened={trocandoSenha} onClose={() => setTrocandoSenha(false)} title="Alterar senha">
        {trocandoSenha && <AlterarSenha aoFechar={() => setTrocandoSenha(false)} />}
      </Modal>
    </AppShell>
  );
}

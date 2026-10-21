import { AppShell, Badge, Burger, Group, Menu, Modal, NavLink, ScrollArea, Select, Text, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconBuilding,
  IconBuildingBank,
  IconBuildingWarehouse,
  IconChartBar,
  IconChevronDown,
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
  IconShoppingBag,
  IconShoppingCart,
  IconTargetArrow,
  IconTruck,
  IconUserCog,
  IconUsers,
} from '@tabler/icons-react';
import { useState } from 'react';
import { NavLink as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { type Permissao, useSessao } from '../sessao/sessao';
import { AlterarSenha } from './AlterarSenha';

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

export function Layout() {
  const [aberto, { toggle, close }] = useDisclosure();
  const { me, pode, trocarEmpresa, sair } = useSessao();
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const local = useLocation();
  const navegar = useNavigate();
  if (!me) return null;

  const trocar = async (empresaId: string | null) => {
    if (!empresaId || empresaId === me.empresaId) return;
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

  return (
    <AppShell header={{ height: 60 }} navbar={{ width: 240, breakpoint: 'sm', collapsed: { mobile: !aberto } }} padding="lg">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={aberto} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Abrir menu" />
            <Text fw={700} c="teal.7" visibleFrom="xs">
              Relda ERP
            </Text>
            {me.empresas.length > 1 ? (
              <Select
                aria-label="Empresa"
                value={me.empresaId}
                onChange={trocar}
                data={me.empresas.map((e) => ({ value: e.id, label: e.nomeFantasia || e.razaoSocial }))}
                allowDeselect={false}
                w={{ base: 180, sm: 260 }}
              />
            ) : (
              <Text size="sm" c="dimmed" lineClamp={1}>
                {me.empresas[0]?.nomeFantasia || me.empresas[0]?.razaoSocial}
              </Text>
            )}
          </Group>
          <Menu position="bottom-end" withArrow>
            <Menu.Target>
              <UnstyledButton aria-label="Menu do usuário">
                <Group gap={6} wrap="nowrap">
                  <div style={{ textAlign: 'right' }}>
                    <Text size="sm" fw={500} lineClamp={1}>
                      {me.usuario.nome}
                    </Text>
                    <Badge size="xs" variant="light">
                      {PERFIS[me.perfil]}
                    </Badge>
                  </div>
                  <IconChevronDown size={16} />
                </Group>
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
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        <AppShell.Section grow component={ScrollArea}>
          {MENU.map(({ grupo, itens }) => {
            const visiveis = itens.filter((i) => !i.permissao || pode(i.permissao));
            if (visiveis.length === 0) return null;
            return (
              <div key={grupo ?? 'inicio'}>
                {grupo && (
                  <Text size="xs" fw={600} c="dimmed" tt="uppercase" px="sm" mt="sm" mb={2}>
                    {grupo}
                  </Text>
                )}
                {visiveis.map((item) => (
                  <NavLink
                    key={item.rota}
                    component={RouterLink}
                    to={item.rota}
                    label={item.rotulo}
                    py={6}
                    leftSection={<item.icone size={18} />}
                    active={item.rota === '/' ? local.pathname === '/' : local.pathname.startsWith(item.rota)}
                    onClick={close}
                  />
                ))}
              </div>
            );
          })}
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
      <Modal opened={trocandoSenha} onClose={() => setTrocandoSenha(false)} title="Alterar senha">
        {trocandoSenha && <AlterarSenha aoFechar={() => setTrocandoSenha(false)} />}
      </Modal>
    </AppShell>
  );
}

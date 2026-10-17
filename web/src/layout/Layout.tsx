import { AppShell, Badge, Burger, Group, Menu, NavLink, Select, Text, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconBuildingBank,
  IconChevronDown,
  IconHome,
  IconLogout,
  IconReceipt,
  IconReceiptRefund,
  IconTruck,
  IconUsers,
} from '@tabler/icons-react';
import { NavLink as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSessao } from '../sessao/sessao';

const MENU = [
  { rota: '/', rotulo: 'Painel', icone: IconHome },
  { rota: '/contas-receber', rotulo: 'Contas a receber', icone: IconReceipt },
  { rota: '/contas-pagar', rotulo: 'Contas a pagar', icone: IconReceiptRefund },
  { rota: '/clientes', rotulo: 'Clientes', icone: IconUsers },
  { rota: '/fornecedores', rotulo: 'Fornecedores', icone: IconTruck },
  { rota: '/contas-bancarias', rotulo: 'Contas bancárias', icone: IconBuildingBank },
];

const PERFIS = { ADMIN: 'Administrador', FINANCEIRO: 'Financeiro', VENDAS: 'Vendas', CONSULTA: 'Consulta' };

export function Layout() {
  const [aberto, { toggle, close }] = useDisclosure();
  const { me, trocarEmpresa, sair } = useSessao();
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
    navegar('/login');
  };

  return (
    <AppShell header={{ height: 60 }} navbar={{ width: 240, breakpoint: 'sm', collapsed: { mobile: !aberto } }} padding="lg">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={aberto} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Abrir menu" />
            <Text fw={700} c="teal.7" visibleFrom="xs">
              ERP Próprio
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
        {MENU.map((item) => (
          <NavLink
            key={item.rota}
            component={RouterLink}
            to={item.rota}
            label={item.rotulo}
            leftSection={<item.icone size={18} />}
            active={item.rota === '/' ? local.pathname === '/' : local.pathname.startsWith(item.rota)}
            onClick={close}
          />
        ))}
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}

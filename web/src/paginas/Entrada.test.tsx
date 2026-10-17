import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessaoProvider } from '../sessao/sessao';
import { Login } from './Entrada';

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

const ME = {
  usuario: { id: 'u1', nome: 'Ana Souza', email: 'ana@a.com' },
  empresaId: 'e2',
  perfil: 'ADMIN',
  empresas: [],
  csrfToken: 'csrf',
};

function renderizar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MantineProvider env="test">
      <QueryClientProvider client={queryClient}>
        <SessaoProvider>
          <MemoryRouter initialEntries={['/login']}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<p>Painel aberto</p>} />
            </Routes>
          </MemoryRouter>
        </SessaoProvider>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('Login', () => {
  const fetchFalso = vi.fn();
  beforeEach(() => vi.stubGlobal('fetch', fetchFalso));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchFalso.mockReset();
  });

  it('pede a empresa quando o usuário tem mais de uma e entra na escolhida', async () => {
    const empresas = [
      { id: 'e1', razaoSocial: 'Empresa Um', nomeFantasia: null, perfil: 'ADMIN' },
      { id: 'e2', razaoSocial: 'Empresa Dois', nomeFantasia: 'Dois', perfil: 'VENDAS' },
    ];
    fetchFalso.mockImplementation(async (url: string, init: RequestInit) => {
      if (url === '/api/auth/me') return fetchFalso.mock.calls.length > 3 ? json(200, ME) : json(401, { message: 'Token não informado' });
      const corpo = JSON.parse(String(init.body));
      return corpo.empresaId ? json(200, { empresaId: corpo.empresaId, csrfToken: 'csrf' }) : json(400, { message: 'Informe empresaId', empresas });
    });

    renderizar();
    const usuario = userEvent.setup();
    await usuario.type(await screen.findByLabelText('E-mail'), 'ana@a.com');
    await usuario.type(screen.getByLabelText('Senha'), 'senha12345');
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    await usuario.click((await screen.findAllByLabelText('Empresa'))[0]);
    await usuario.click(await screen.findByRole('option', { name: 'Dois' }));
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Painel aberto')).toBeInTheDocument();
    const login = fetchFalso.mock.calls.filter(([url]) => url === '/api/auth/login').at(-1)!;
    expect(JSON.parse(login[1].body)).toEqual({ email: 'ana@a.com', senha: 'senha12345', empresaId: 'e2' });
  });

  it('mostra a mensagem da API quando o login é recusado', async () => {
    fetchFalso.mockImplementation(async (url: string) =>
      url === '/api/auth/me' ? json(401, {}) : json(401, { message: 'E-mail ou senha inválidos' }),
    );
    renderizar();
    const usuario = userEvent.setup();
    await usuario.type(await screen.findByLabelText('E-mail'), 'ana@a.com');
    await usuario.type(screen.getByLabelText('Senha'), 'errada');
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(fetchFalso.mock.calls.some(([url]) => url === '/api/auth/login')).toBe(true));
    expect(screen.queryByText('Painel aberto')).not.toBeInTheDocument();
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/cliente';
import { SessaoProvider, useSessao } from './sessao';

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

const ME = {
  usuario: { id: 'u1', nome: 'Ana Souza', email: 'ana@a.com' },
  empresaId: 'e1',
  perfil: 'ADMIN',
  empresas: [],
  csrfToken: 'csrf',
};

function Tela() {
  const { me, carregando, sair } = useSessao();
  if (carregando) return <p>carregando</p>;
  return me ? (
    <>
      <p>Logado como {me.usuario.nome}</p>
      <button onClick={() => sair()}>Sair</button>
      <button onClick={() => api.get('/clientes').catch(() => undefined)}>Chamar API</button>
    </>
  ) : (
    <p>Sem sessão</p>
  );
}

function renderizar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <SessaoProvider>
        <Tela />
      </SessaoProvider>
    </QueryClientProvider>,
  );
}

describe('SessaoProvider', () => {
  const fetchFalso = vi.fn();
  beforeEach(() => vi.stubGlobal('fetch', fetchFalso));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchFalso.mockReset();
  });

  it('sair encerra a sessão na tela', async () => {
    fetchFalso.mockImplementation(async (rota: string) => (rota.endsWith('/auth/me') ? json(200, ME) : new Response(null, { status: 204 })));
    renderizar();
    await userEvent.click(await screen.findByRole('button', { name: 'Sair' }));

    expect(await screen.findByText('Sem sessão')).toBeInTheDocument();
    expect(fetchFalso).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }));
  });

  it('um 401 de qualquer tela encerra a sessão', async () => {
    fetchFalso.mockImplementation(async (rota: string) =>
      rota.endsWith('/auth/me') ? json(200, ME) : json(401, { message: 'Sessão encerrada' }),
    );
    renderizar();
    await userEvent.click(await screen.findByRole('button', { name: 'Chamar API' }));

    expect(await screen.findByText('Sem sessão')).toBeInTheDocument();
  });
});

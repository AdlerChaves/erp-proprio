import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, aoSessaoExpirar, consulta, definirCsrf } from './cliente';

const resposta = (status: number, corpo?: unknown) =>
  new Response(corpo === undefined ? null : JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

describe('cliente da API', () => {
  const fetchFalso = vi.fn();
  const cabecalhos = () => fetchFalso.mock.calls.at(-1)![1].headers as Record<string, string>;

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchFalso);
    definirCsrf('token-csrf');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchFalso.mockReset();
  });

  it('pede a sessão em cookie e envia o CSRF só nas escritas', async () => {
    fetchFalso.mockResolvedValue(resposta(200, []));
    await api.get('/clientes');
    expect(cabecalhos()).toEqual({ 'X-Sessao': 'cookie' });
    expect(fetchFalso.mock.calls[0][0]).toBe('/api/clientes');

    await api.post('/clientes', { nome: 'X' });
    expect(cabecalhos()).toMatchObject({ 'X-Sessao': 'cookie', 'X-CSRF-Token': 'token-csrf', 'Content-Type': 'application/json' });
    expect(fetchFalso.mock.calls[1][1]).toMatchObject({ method: 'POST', body: '{"nome":"X"}', credentials: 'same-origin' });
  });

  it('junta as mensagens de validação num erro com o status', async () => {
    fetchFalso.mockResolvedValue(resposta(400, { message: ['nome é obrigatório', 'documento inválido'] }));
    const erro = await api.post('/clientes', {}).catch((e) => e);
    expect(erro).toBeInstanceOf(ApiError);
    expect(erro).toMatchObject({ status: 400, message: 'nome é obrigatório; documento inválido' });
  });

  it('avisa quando a sessão expira, mas não por erro de login', async () => {
    const expirou = vi.fn();
    aoSessaoExpirar(expirou);
    fetchFalso.mockResolvedValue(resposta(401, { message: 'Token inválido' }));

    await api.post('/auth/login', {}).catch(() => undefined);
    expect(expirou).not.toHaveBeenCalled();
    await api.get('/clientes').catch(() => undefined);
    expect(expirou).toHaveBeenCalledOnce();
  });

  it('traduz o limite de requisições e aceita respostas sem corpo', async () => {
    fetchFalso.mockResolvedValueOnce(new Response('', { status: 429 }));
    await expect(api.post('/auth/login', {})).rejects.toThrow('Muitas tentativas');
    fetchFalso.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(api.delete('/clientes/1')).resolves.toBeUndefined();
  });

  it('monta a query string sem filtros vazios', () => {
    expect(consulta({ status: 'PAGA', clienteId: null, de: '', ate: undefined, limite: 10 })).toBe('?status=PAGA&limite=10');
    expect(consulta({ status: undefined })).toBe('');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, aoSessaoExpirar, consulta, definirCsrf, enviarArquivo, nomeDoDownload } from './cliente';

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

  it('envia arquivo em multipart, com CSRF e sem forçar o Content-Type', async () => {
    fetchFalso.mockResolvedValue(resposta(201, { id: 'a1' }));
    const arquivo = new File(['%PDF-1.7'], 'boleto.pdf', { type: 'application/pdf' });
    await expect(enviarArquivo('/contas-pagar/c1/anexos', arquivo)).resolves.toEqual({ id: 'a1' });

    const [rota, opcoes] = fetchFalso.mock.calls[0];
    expect(rota).toBe('/api/contas-pagar/c1/anexos');
    expect(opcoes.method).toBe('POST');
    // O navegador precisa montar o Content-Type com o "boundary" do multipart.
    expect(cabecalhos()).toEqual({ 'X-Sessao': 'cookie', 'X-CSRF-Token': 'token-csrf' });
    expect((opcoes.body as FormData).get('arquivo')).toBeInstanceOf(File);
  });

  it('lê o nome do download preferindo o filename* em UTF-8', () => {
    expect(nomeDoDownload(`attachment; filename="Nota fiscal marco.pdf"; filename*=UTF-8''Nota%20fiscal%20mar%C3%A7o.pdf`, 'x')).toBe(
      'Nota fiscal março.pdf',
    );
    expect(nomeDoDownload('attachment; filename="dps.xml"', 'x')).toBe('dps.xml');
    expect(nomeDoDownload(null, 'padrao.pdf')).toBe('padrao.pdf');
    // filename* malformado não derruba o download: cai no filename comum.
    expect(nomeDoDownload(`attachment; filename="a.pdf"; filename*=UTF-8''%E0%A4%A`, 'x')).toBe('a.pdf');
  });

  it('monta a query string sem filtros vazios', () => {
    expect(consulta({ status: 'PAGA', clienteId: null, de: '', ate: undefined, limite: 10 })).toBe('?status=PAGA&limite=10');
    expect(consulta({ status: undefined })).toBe('');
  });
});

import { INestApplication } from '@nestjs/common';
import { Acesso, api, criarApp, limparBanco, registrarEmpresa } from './helpers';

const VIACEP = {
  cep: '13220-000',
  logradouro: 'Rua Duque de Caxias',
  complemento: 'até 999/1000',
  bairro: 'Centro',
  localidade: 'Várzea Paulista',
  uf: 'SP',
  ibge: '3556503',
};
const BRASILAPI = { cep: '13220000', state: 'SP', city: 'Varzea Paulista', neighborhood: 'Centro', street: 'Rua Duque de Caxias', service: 'correios' };

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

describe('Consulta de CEP', () => {
  let app: INestApplication;
  let a: Acesso;
  let fetchFalso: jest.SpyInstance;
  let n = 0;
  /** CEP diferente a cada teste, para o cache de um não interferir no outro. */
  const cep = () => String(13_220_000 + ++n);

  beforeAll(async () => {
    app = await criarApp();
  });
  beforeEach(async () => {
    await limparBanco(app);
    a = await registrarEmpresa(app);
    fetchFalso = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => fetchFalso.mockRestore());
  afterAll(() => app.close());

  const urls = () => fetchFalso.mock.calls.map(([url]) => String(url));

  it('ViaCEP: endereço com o código IBGE, sem a faixa de numeração no complemento, e guarda em cache', async () => {
    const c = cep();
    fetchFalso.mockResolvedValue(json(200, VIACEP));
    const { body } = await api(app, a.token).get(`/cep/${c.slice(0, 5)}-${c.slice(5)}`).expect(200);
    expect(body).toEqual({
      cep: c,
      logradouro: 'Rua Duque de Caxias',
      bairro: 'Centro',
      codigoMunicipio: '3556503',
      municipio: { nome: 'Várzea Paulista', uf: 'SP' },
      fonte: 'ViaCEP',
    });
    expect(urls()).toEqual([`https://viacep.com.br/ws/${c}/json/`]);

    await api(app, a.token).get(`/cep/${c}`).expect(200);
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it('com a ViaCEP fora do ar, usa a BrasilAPI e acha o município pelo nome sem acento', async () => {
    const c = cep();
    fetchFalso.mockResolvedValueOnce(json(503, {})).mockResolvedValueOnce(json(200, { ...BRASILAPI, cep: c }));
    const { body } = await api(app, a.token).get(`/cep/${c}`).expect(200);
    expect(body).toMatchObject({ codigoMunicipio: '3556503', municipio: { nome: 'Várzea Paulista', uf: 'SP' }, fonte: 'BrasilAPI' });
    expect(urls()[1]).toBe(`https://brasilapi.com.br/api/cep/v2/${c}`);
  });

  it('CEP geral de município vem só com a cidade', async () => {
    fetchFalso.mockResolvedValue(json(200, { ...VIACEP, logradouro: '', bairro: '' }));
    const { body } = await api(app, a.token).get(`/cep/${cep()}`).expect(200);
    expect(body).toMatchObject({ logradouro: '', bairro: '', codigoMunicipio: '3556503' });
  });

  it('não encontrado só quando nenhuma fonte acha; as duas fora do ar dão 503', async () => {
    let c = cep();
    fetchFalso.mockResolvedValueOnce(json(200, { erro: 'true' })).mockResolvedValueOnce(json(200, { ...BRASILAPI, cep: c }));
    expect((await api(app, a.token).get(`/cep/${c}`).expect(200)).body.fonte).toBe('BrasilAPI');

    c = cep();
    fetchFalso.mockResolvedValueOnce(json(200, { erro: true })).mockResolvedValueOnce(json(404, { message: 'não encontrado' }));
    expect((await api(app, a.token).get(`/cep/${c}`).expect(404)).body.message).toBe(`CEP ${c.slice(0, 5)}-${c.slice(5)} não encontrado`);

    fetchFalso.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(json(500, {}));
    expect((await api(app, a.token).get(`/cep/${cep()}`).expect(503)).body.message).toMatch(/preencha o endereço manualmente/);
  });

  it('valida o CEP antes de consultar e exige login', async () => {
    for (const invalido of ['1322000', '00000000', 'abcdefgh']) await api(app, a.token).get(`/cep/${invalido}`).expect(400);
    expect(fetchFalso).not.toHaveBeenCalled();
    await api(app).get('/cep/13220000').expect(401);
  });
});

import { INestApplication } from '@nestjs/common';
import { Acesso, api, criarApp, limparBanco, registrarEmpresa } from './helpers';

/** Resposta no formato da BrasilAPI / Minha Receita. */
const RECEITA = {
  cnpj: '12345678000195',
  razao_social: 'PADARIA PAO QUENTE LTDA',
  nome_fantasia: 'PAO QUENTE',
  descricao_situacao_cadastral: 'ATIVA',
  descricao_tipo_de_logradouro: 'RUA',
  logradouro: 'DUQUE DE CAXIAS',
  numero: '100',
  complemento: 'SALA 2',
  bairro: 'VILA SANTA TEREZINHA',
  cep: '13220000',
  codigo_municipio_ibge: 3556503,
  municipio: 'VARZEA PAULISTA',
  uf: 'SP',
  ddd_telefone_1: '1146060000',
  email: 'CONTATO@PAOQUENTE.COM.BR',
  opcao_pelo_simples: true,
  opcao_pelo_mei: false,
};

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

describe('Consulta de CNPJ', () => {
  let app: INestApplication;
  let a: Acesso;
  let fetchFalso: jest.SpyInstance;
  let n = 0;
  /** CNPJ válido e diferente a cada teste, para o cache de um não interferir no outro. */
  const cnpj = () => {
    const d = String(++n + 50_000_000).padStart(12, '0').split('').map(Number);
    for (const pesos of [[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]]) {
      const resto = d.reduce((s, v, i) => s + v * pesos[i], 0) % 11;
      d.push(resto < 2 ? 0 : 11 - resto);
    }
    return d.join('');
  };

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

  it('converte os dados da Receita para o formato do cadastro', async () => {
    const c = cnpj();
    fetchFalso.mockResolvedValue(json(200, { ...RECEITA, cnpj: c }));
    const { body } = await api(app, a.token).get(`/cnpj/${c}`).expect(200);
    expect(body).toMatchObject({
      cnpj: c,
      razaoSocial: 'PADARIA PAO QUENTE LTDA',
      nomeFantasia: 'PAO QUENTE',
      situacao: 'ATIVA',
      ativa: true,
      email: 'contato@paoquente.com.br',
      telefone: '1146060000',
      endereco: {
        cep: '13220000',
        logradouro: 'RUA DUQUE DE CAXIAS',
        numero: '100',
        complemento: 'SALA 2',
        bairro: 'VILA SANTA TEREZINHA',
        codigoMunicipio: '3556503',
      },
      municipio: { nome: 'Várzea Paulista', uf: 'SP' },
      simplesNacional: true,
      mei: false,
      fonte: 'BrasilAPI',
    });
    expect(urls()).toEqual([`https://brasilapi.com.br/api/cnpj/v1/${c}`]);
  });

  it('aceita o CNPJ com pontuação e guarda o resultado, sem consultar de novo', async () => {
    const c = cnpj();
    fetchFalso.mockResolvedValue(json(200, { ...RECEITA, cnpj: c }));
    const formatado = c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    await api(app, a.token).get(`/cnpj/${encodeURIComponent(formatado)}`).expect(200);
    await api(app, a.token).get(`/cnpj/${c}`).expect(200);
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it('se a BrasilAPI falhar, usa a Minha Receita', async () => {
    const c = cnpj();
    fetchFalso.mockResolvedValueOnce(json(502, { message: 'erro' })).mockResolvedValueOnce(json(200, { ...RECEITA, cnpj: c }));
    const { body } = await api(app, a.token).get(`/cnpj/${c}`).expect(200);
    expect(body.fonte).toBe('Minha Receita');
    expect(urls()[1]).toBe(`https://minhareceita.org/${c}`);
  });

  it('também troca de fonte quando a primeira não responde (erro de rede)', async () => {
    const c = cnpj();
    fetchFalso.mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(json(200, { ...RECEITA, cnpj: c }));
    expect((await api(app, a.token).get(`/cnpj/${c}`).expect(200)).body.fonte).toBe('Minha Receita');
  });

  it('CNPJ que não existe na Receita: 404, sem tentar a outra fonte', async () => {
    fetchFalso.mockResolvedValue(json(404, { message: 'não encontrado' }));
    const res = await api(app, a.token).get(`/cnpj/${cnpj()}`).expect(404);
    expect(res.body.message).toBe('CNPJ não encontrado na Receita Federal');
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it('todas as fontes fora do ar: 503 com orientação', async () => {
    fetchFalso.mockResolvedValue(json(500, {}));
    const res = await api(app, a.token).get(`/cnpj/${cnpj()}`).expect(503);
    expect(res.body.message).toMatch(/preencha os dados manualmente/);
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it('situação diferente de ativa, sem número, município desconhecido e endereço vazio', async () => {
    const c = cnpj();
    fetchFalso.mockResolvedValue(
      json(200, {
        ...RECEITA,
        cnpj: c,
        descricao_situacao_cadastral: 'BAIXADA',
        numero: 'SN',
        logradouro: '',
        codigo_municipio_ibge: 9999999,
        email: null,
        ddd_telefone_1: '',
      }),
    );
    const { body } = await api(app, a.token).get(`/cnpj/${c}`).expect(200);
    expect(body).toMatchObject({ situacao: 'BAIXADA', ativa: false, email: null, telefone: null });
    expect(body.endereco).toMatchObject({ logradouro: '', numero: 'S/N', codigoMunicipio: null });
    expect(body.municipio).toEqual({ nome: 'VARZEA PAULISTA', uf: 'SP' });
  });

  it('não repete o tipo quando o nome do logradouro já o contém', async () => {
    const c = cnpj();
    fetchFalso.mockResolvedValue(
      json(200, { ...RECEITA, cnpj: c, descricao_tipo_de_logradouro: 'QUADRA', logradouro: 'SAUN QUADRA 5 BLOCO B TORRE I, II, III' }),
    );
    const { body } = await api(app, a.token).get(`/cnpj/${c}`).expect(200);
    expect(body.endereco.logradouro).toBe('SAUN QUADRA 5 BLOCO B TORRE I, II, III');
  });

  it('recusa CNPJ com dígito errado sem consultar ninguém', async () => {
    await api(app, a.token).get('/cnpj/12345678000196').expect(400);
    await api(app, a.token).get('/cnpj/123').expect(400);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it('exige login', async () => {
    await api(app).get(`/cnpj/${cnpj()}`).expect(401);
  });
});

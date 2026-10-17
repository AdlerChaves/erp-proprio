import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Acesso, api, criarApp, limparBanco, registrarEmpresa, SENHA } from './helpers';

/** Navegador simulado: guarda e reenvia cookies, e pede a sessão em cookie como o frontend faz. */
function navegador(app: INestApplication) {
  const agente = request.agent(app.getHttpServer());
  let csrf: string | undefined;
  const preparar = (req: request.Test, comCsrf = true) => {
    req.set('X-Sessao', 'cookie');
    return comCsrf && csrf ? req.set('X-CSRF-Token', csrf) : req;
  };
  return {
    agente,
    usarCsrf: (valor: string | undefined) => (csrf = valor),
    get: (rota: string) => preparar(agente.get(`/api${rota}`)),
    post: (rota: string, corpo: object = {}, comCsrf = true) => preparar(agente.post(`/api${rota}`), comCsrf).send(corpo),
    patch: (rota: string, corpo: object = {}) => preparar(agente.patch(`/api${rota}`)).send(corpo),
  };
}

const cookieDe = (res: request.Response) =>
  ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('erp_sessao='));

describe('Sessão por cookie (frontend)', () => {
  let app: INestApplication;
  let a: Acesso;

  beforeAll(async () => {
    app = await criarApp();
  });
  beforeEach(async () => {
    await limparBanco(app);
    a = await registrarEmpresa(app);
  });
  afterAll(() => app.close());

  async function entrar() {
    const nav = navegador(app);
    const res = await nav.post('/auth/login', { email: a.email, senha: SENHA, empresaId: a.empresaId }, false).expect(200);
    nav.usarCsrf(res.body.csrfToken);
    return { nav, res };
  }

  it('o login entrega a sessão num cookie httpOnly e não devolve o token no corpo', async () => {
    const { res } = await entrar();
    expect(res.body).toEqual({ empresaId: a.empresaId, csrfToken: expect.any(String) });
    const cookie = cookieDe(res)!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\/api/);
    expect(cookie).toMatch(/Max-Age=28800/);
  });

  it('o cadastro também entrega a sessão em cookie', async () => {
    const nav = navegador(app);
    const res = await nav
      .post('/auth/registrar', {
        empresa: { razaoSocial: 'Pelo navegador', cnpj: '55555555000155' },
        usuario: { nome: 'Nav', email: 'nav@teste.com', senha: 'senha-do-nav' },
      }, false)
      .expect(201);
    expect(res.body.accessToken).toBeUndefined();
    expect(cookieDe(res)).toBeDefined();
    await nav.get('/clientes').expect(200);
  });

  it('leituras funcionam só com o cookie, e /auth/me devolve o token CSRF da sessão', async () => {
    const { nav, res } = await entrar();
    await nav.get('/clientes').expect(200);
    const me = await nav.get('/auth/me').expect(200);
    expect(me.body).toMatchObject({ empresaId: a.empresaId, perfil: 'ADMIN', csrfToken: res.body.csrfToken });
  });

  it('escritas por cookie exigem o token CSRF correto', async () => {
    const { nav, res } = await entrar();
    const cliente = { nome: 'Cliente', documento: '12345678901' };

    nav.usarCsrf(undefined);
    expect((await nav.post('/clientes', cliente).expect(403)).body.message).toMatch(/CSRF/);
    nav.usarCsrf('token-falso');
    await nav.post('/clientes', cliente).expect(403);
    nav.usarCsrf(res.body.csrfToken);
    await nav.post('/clientes', cliente).expect(201);
  });

  it('com o cabeçalho Authorization, o CSRF não é exigido', async () => {
    await api(app, a.token).post('/clientes', { nome: 'Cliente', documento: '12345678901' }).expect(201);
  });

  it('trocar de empresa renova o cookie e o token CSRF', async () => {
    const outra = await api(app, a.token).post('/empresas', { razaoSocial: 'Filial', cnpj: '33333333000133' }).expect(201);
    const { nav, res } = await entrar();

    const troca = await nav.post('/auth/trocar-empresa', { empresaId: outra.body.id }).expect(200);
    expect(troca.body).toEqual({ empresaId: outra.body.id, csrfToken: expect.any(String) });
    expect(troca.body.csrfToken).not.toBe(res.body.csrfToken);
    expect(cookieDe(troca)).toBeDefined();

    expect((await nav.get('/auth/me').expect(200)).body.empresaId).toBe(outra.body.id);
    await nav.post('/clientes', { nome: 'X', documento: '12345678901' }).expect(403);
    nav.usarCsrf(troca.body.csrfToken);
    await nav.post('/clientes', { nome: 'X', documento: '12345678901' }).expect(201);
  });

  it('trocar a senha renova o cookie da sessão atual', async () => {
    const { nav } = await entrar();
    const res = await nav.patch('/auth/senha', { senhaAtual: SENHA, novaSenha: 'outra-senha-boa' }).expect(200);
    expect(res.body.accessToken).toBeUndefined();
    nav.usarCsrf(res.body.csrfToken);
    await nav.get('/clientes').expect(200);
    await api(app, a.token).get('/clientes').expect(401);
  });

  it('logout apaga o cookie', async () => {
    const { nav } = await entrar();
    const res = await nav.post('/auth/logout').expect(204);
    expect(cookieDe(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
    await nav.get('/clientes').expect(401);
  });

  it('logout também exige o token CSRF, para outro site não deslogar o usuário', async () => {
    const { nav } = await entrar();
    nav.usarCsrf(undefined);
    await nav.post('/auth/logout').expect(403);
    await nav.get('/clientes').expect(200);
  });

  it('encerrar sessões apaga o cookie e invalida os demais tokens', async () => {
    const { nav } = await entrar();
    const res = await nav.post('/auth/sessoes/encerrar').expect(204);
    expect(cookieDe(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
    await api(app, a.token).get('/clientes').expect(401);
  });
});

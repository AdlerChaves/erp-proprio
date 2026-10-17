import { INestApplication } from '@nestjs/common';
import { Perfil } from '../src/modules/usuarios/perfil.enum';
import { Acesso, api, criarApp, criarCliente, limparBanco, registrarEmpresa, SENHA } from './helpers';

/** Um mesmo usuário com acesso a mais de uma empresa. */
describe('Multiempresa', () => {
  let app: INestApplication;
  let a: Acesso;
  let b: Acesso;

  beforeAll(async () => {
    app = await criarApp();
  });
  beforeEach(async () => {
    await limparBanco(app);
    a = await registrarEmpresa(app);
    b = await registrarEmpresa(app);
  });
  afterAll(() => app.close());

  /** Dá ao admin de B acesso à empresa A com o perfil informado. */
  const vincularBemA = (perfil: Perfil) =>
    api(app, a.token).post('/usuarios', { email: b.email, perfil }).expect(201);

  it('vincula usuário existente sem pedir senha e sem alterar a dele', async () => {
    const res = await vincularBemA(Perfil.VENDAS);
    expect(res.body).toMatchObject({ id: b.usuarioId, perfil: 'VENDAS' });
    await api(app).post('/auth/login', { email: b.email, senha: SENHA, empresaId: b.empresaId }).expect(200);
  });

  describe('login', () => {
    beforeEach(() => vincularBemA(Perfil.VENDAS));

    it('pede empresaId e lista as empresas quando o usuário tem mais de uma', async () => {
      const res = await api(app).post('/auth/login', { email: b.email, senha: SENHA }).expect(400);
      expect(res.body.empresas.map((e: { id: string }) => e.id).sort()).toEqual([a.empresaId, b.empresaId].sort());
    });

    it('entra na empresa escolhida, com o perfil daquela empresa', async () => {
      const res = await api(app).post('/auth/login', { email: b.email, senha: SENHA, empresaId: a.empresaId }).expect(200);
      const me = await api(app, res.body.accessToken).get('/auth/me').expect(200);
      expect(me.body).toMatchObject({ empresaId: a.empresaId, perfil: 'VENDAS' });
      expect(me.body.empresas).toHaveLength(2);
    });

    it('recusa empresa à qual o usuário não tem acesso', async () => {
      const c = await registrarEmpresa(app);
      await api(app).post('/auth/login', { email: b.email, senha: SENHA, empresaId: c.empresaId }).expect(401);
    });
  });

  describe('trocar de empresa', () => {
    it('passa a ver os dados e a ter o perfil da outra empresa', async () => {
      await vincularBemA(Perfil.VENDAS);
      const clienteA = await criarCliente(app, a.token);

      const res = await api(app, b.token).post('/auth/trocar-empresa', { empresaId: a.empresaId }).expect(200);
      const tokenEmA = res.body.accessToken;

      const clientes = await api(app, tokenEmA).get('/clientes').expect(200);
      expect(clientes.body.map((c: { id: string }) => c.id)).toEqual([clienteA.id]);
      await api(app, tokenEmA).delete(`/clientes/${clienteA.id}`).expect(403);
      await api(app, b.token).get('/usuarios').expect(200);
    });

    it('recusa empresa à qual o usuário não tem acesso', async () => {
      await api(app, b.token).post('/auth/trocar-empresa', { empresaId: a.empresaId }).expect(401);
    });

    it('com o acesso bloqueado na empresa atual, não consegue trocar', async () => {
      await vincularBemA(Perfil.VENDAS);
      const login = await api(app).post('/auth/login', { email: b.email, senha: SENHA, empresaId: a.empresaId }).expect(200);
      await api(app, a.token).patch(`/usuarios/${b.usuarioId}`, { ativo: false }).expect(200);

      await api(app, login.body.accessToken).post('/auth/trocar-empresa', { empresaId: b.empresaId }).expect(401);
      await api(app, b.token).get('/clientes').expect(200);
    });
  });

  describe('criar empresa', () => {
    it('torna o usuário administrador da nova empresa', async () => {
      const nova = await api(app, a.token).post('/empresas', { razaoSocial: 'Filial', cnpj: '33333333000133' }).expect(201);
      const troca = await api(app, a.token).post('/auth/trocar-empresa', { empresaId: nova.body.id }).expect(200);
      const me = await api(app, troca.body.accessToken).get('/auth/me').expect(200);
      expect(me.body).toMatchObject({ empresaId: nova.body.id, perfil: 'ADMIN' });
    });

    it('recusa CNPJ já cadastrado', async () => {
      const atual = await api(app, a.token).get('/empresas/atual').expect(200);
      await api(app, b.token).post('/empresas', { razaoSocial: 'Cópia', cnpj: atual.body.cnpj }).expect(409);
    });
  });
});

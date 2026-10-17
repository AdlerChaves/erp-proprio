import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MENSAGEM_LOGIN_RECUSADO } from '../src/modules/auth/auth.service';
import { api, criarApp, limparBanco, registrarEmpresa, SENHA } from './helpers';

describe('Autenticação', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await criarApp();
  });
  beforeEach(() => limparBanco(app));
  afterAll(() => app.close());

  it('libera /health sem token', async () => {
    await api(app).get('/health').expect(200, { status: 'ok' });
  });

  describe('rotas protegidas', () => {
    it('recusam requisição sem token', async () => {
      await api(app).get('/clientes').expect(401);
    });

    it('recusam token malformado', async () => {
      await api(app, 'abc').get('/clientes').expect(401);
    });

    it('recusam token assinado com outro segredo', async () => {
      const { usuarioId, empresaId } = await registrarEmpresa(app);
      const falso = new JwtService({ secret: 'outro-segredo' }).sign({ sub: usuarioId, empresaId });
      await api(app, falso).get('/clientes').expect(401);
    });
  });

  describe('registrar', () => {
    it('cria empresa e administrador e devolve um token válido', async () => {
      const res = await api(app)
        .post('/auth/registrar', {
          empresa: { razaoSocial: 'Empresa A Ltda', cnpj: '11111111000111' },
          usuario: { nome: 'Ana', email: 'Ana@A.com ', senha: SENHA },
        })
        .expect(201);

      const me = await api(app, res.body.accessToken).get('/auth/me').expect(200);
      expect(me.body).toMatchObject({
        usuario: { nome: 'Ana', email: 'ana@a.com' },
        empresaId: res.body.empresaId,
        perfil: 'ADMIN',
      });
    });

    it('recusa CNPJ já cadastrado', async () => {
      const corpo = (email: string) => ({
        empresa: { razaoSocial: 'Empresa', cnpj: '11111111000111' },
        usuario: { nome: 'Fulano', email, senha: SENHA },
      });
      await api(app).post('/auth/registrar', corpo('a@a.com')).expect(201);
      await api(app).post('/auth/registrar', corpo('b@b.com')).expect(409);
    });

    it('recusa e-mail já cadastrado', async () => {
      const { email } = await registrarEmpresa(app);
      await api(app)
        .post('/auth/registrar', {
          empresa: { razaoSocial: 'Outra', cnpj: '99999999000199' },
          usuario: { nome: 'Fulano', email, senha: SENHA },
        })
        .expect(409);
    });

    it('valida CNPJ e tamanho mínimo da senha', async () => {
      const res = await api(app)
        .post('/auth/registrar', {
          empresa: { razaoSocial: 'Empresa', cnpj: '123' },
          usuario: { nome: 'Fulano', email: 'f@f.com', senha: 'curta' },
        })
        .expect(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('cnpj'), expect.stringContaining('senha')]),
      );
    });
  });

  describe('login', () => {
    it('aceita o e-mail com maiúsculas e espaços', async () => {
      const { email, empresaId } = await registrarEmpresa(app);
      const res = await api(app)
        .post('/auth/login', { email: `  ${email.toUpperCase()} `, senha: SENHA })
        .expect(200);
      expect(res.body.empresaId).toBe(empresaId);
    });

    it('responde igual para senha errada e e-mail inexistente', async () => {
      const { email } = await registrarEmpresa(app);
      const senhaErrada = await api(app).post('/auth/login', { email, senha: 'errada123' }).expect(401);
      const semConta = await api(app)
        .post('/auth/login', { email: 'ninguem@teste.com', senha: 'errada123' })
        .expect(401);
      expect(senhaErrada.body.message).toBe(MENSAGEM_LOGIN_RECUSADO);
      expect(semConta.body.message).toBe(senhaErrada.body.message);
    });
  });

  describe('alterar senha', () => {
    it('exige a senha atual correta', async () => {
      const { token } = await registrarEmpresa(app);
      await api(app, token).patch('/auth/senha', { senhaAtual: 'errada123', novaSenha: 'nova123456' }).expect(400);
    });

    it('troca a senha: a nova passa a valer e a antiga não', async () => {
      const { token, email } = await registrarEmpresa(app);
      const res = await api(app, token).patch('/auth/senha', { senhaAtual: SENHA, novaSenha: 'nova123456' }).expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
      await api(app).post('/auth/login', { email, senha: 'nova123456' }).expect(200);
      await api(app).post('/auth/login', { email, senha: SENHA }).expect(401);
    });
  });
});

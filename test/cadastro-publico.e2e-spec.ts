import { INestApplication } from '@nestjs/common';
import { api, cnpjValido, criarApp, limparBanco } from './helpers';

/** Com o ERP na internet, ninguém de fora pode criar uma empresa nova pela tela de cadastro. */
describe('Cadastro público de empresas', () => {
  let app: INestApplication;
  const anterior = process.env.CADASTRO_ABERTO;

  beforeAll(async () => {
    app = await criarApp();
  });
  beforeEach(() => limparBanco(app));
  afterEach(() => {
    if (anterior === undefined) delete process.env.CADASTRO_ABERTO;
    else process.env.CADASTRO_ABERTO = anterior;
  });
  afterAll(() => app.close());

  const registrar = (n: number) =>
    api(app).post('/auth/registrar', {
      empresa: { razaoSocial: `Empresa ${n}`, cnpj: cnpjValido(900 + n) },
      usuario: { nome: `Pessoa ${n}`, email: `pessoa${n}@teste.com`, senha: 'senha12345' },
    });

  it('fica aberto por padrão (instalação local)', async () => {
    delete process.env.CADASTRO_ABERTO;
    await registrar(1).expect(201);
  });

  it('com CADASTRO_ABERTO=false, recusa o cadastro e não cria nada', async () => {
    process.env.CADASTRO_ABERTO = 'false';
    const res = await registrar(2).expect(403);
    expect(res.body.message).toMatch(/cadastro de novas empresas está desativado/i);
    process.env.CADASTRO_ABERTO = 'true';
    await api(app).post('/auth/login', { email: 'pessoa2@teste.com', senha: 'senha12345' }).expect(401);
  });
});

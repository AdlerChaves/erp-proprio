import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configurarApp } from '../src/app.setup';
import { Perfil } from '../src/modules/usuarios/perfil.enum';

export const SENHA = 'senha12345';

export async function criarApp() {
  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = modulo.createNestApplication();
  configurarApp(app);
  await app.init();
  return app;
}

/** Esvazia todas as tabelas, exceto o controle de migrations. */
export async function limparBanco(app: INestApplication) {
  const dataSource = app.get(DataSource);
  const tabelas: { tablename: string }[] = await dataSource.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migrations'`,
  );
  await dataSource.query(`TRUNCATE ${tabelas.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
}

/** Cliente HTTP com prefixo /api e, se informado, o token. */
export function api(app: INestApplication, token?: string) {
  const http = request(app.getHttpServer());
  const autenticar = (req: request.Test) => (token ? req.set('Authorization', `Bearer ${token}`) : req);
  return {
    get: (rota: string) => autenticar(http.get(`/api${rota}`)),
    post: (rota: string, corpo: object = {}) => autenticar(http.post(`/api${rota}`)).send(corpo),
    patch: (rota: string, corpo: object = {}) => autenticar(http.patch(`/api${rota}`)).send(corpo),
    delete: (rota: string) => autenticar(http.delete(`/api${rota}`)),
  };
}

let sequencia = 0;

/** CNPJ com dígitos verificadores corretos (a nota de serviço recusa CNPJ inválido). */
export function cnpjValido(n: number) {
  const d = String(n).padStart(12, '0').split('').map(Number);
  for (const pesos of [[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]]) {
    const resto = d.reduce((s, v, i) => s + v * pesos[i], 0) % 11;
    d.push(resto < 2 ? 0 : 11 - resto);
  }
  return d.join('');
}

export interface Acesso {
  token: string;
  empresaId: string;
  usuarioId: string;
  email: string;
}

/** Cria uma empresa nova com seu administrador. */
export async function registrarEmpresa(app: INestApplication): Promise<Acesso> {
  const n = ++sequencia;
  const email = `admin${n}@teste.com`;
  const res = await api(app)
    .post('/auth/registrar', {
      empresa: { razaoSocial: `Empresa ${n}`, cnpj: cnpjValido(n) },
      usuario: { nome: `Admin ${n}`, email, senha: SENHA },
    })
    .expect(201);
  const me = await api(app, res.body.accessToken).get('/auth/me').expect(200);
  return { token: res.body.accessToken, empresaId: res.body.empresaId, usuarioId: me.body.usuario.id, email };
}

/** Cria um usuário novo com acesso à empresa do admin e faz login com ele. */
export async function adicionarUsuario(app: INestApplication, admin: Acesso, perfil: Perfil): Promise<Acesso> {
  const n = ++sequencia;
  const email = `usuario${n}@teste.com`;
  const res = await api(app, admin.token)
    .post('/usuarios', { email, nome: `Usuário ${n}`, senha: SENHA, perfil })
    .expect(201);
  const login = await api(app).post('/auth/login', { email, senha: SENHA }).expect(200);
  return { token: login.body.accessToken, empresaId: admin.empresaId, usuarioId: res.body.id, email };
}

let documento = 10_000_000_000;

export async function criarCliente(app: INestApplication, token: string, doc = String(++documento)) {
  const res = await api(app, token).post('/clientes', { nome: `Cliente ${doc}`, documento: doc }).expect(201);
  return res.body as { id: string; documento: string };
}

export async function criarConta(app: INestApplication, token: string, clienteId: string) {
  const res = await api(app, token)
    .post('/contas-receber', { clienteId, descricao: 'Venda', valor: 150.5, dataVencimento: '2099-01-10' })
    .expect(201);
  return res.body as { id: string };
}

let contaBancaria = 0;

export async function criarContaBancaria(app: INestApplication, token: string) {
  const res = await api(app, token)
    .post('/contas-bancarias', { nome: `Caixa ${++contaBancaria}`, tipo: 'CAIXA', saldoInicial: 0 })
    .expect(201);
  return res.body as { id: string };
}

let documentoFornecedor = 30_000_000_000;

export async function criarFornecedor(app: INestApplication, token: string) {
  const res = await api(app, token)
    .post('/fornecedores', { nome: 'Fornecedor', documento: String(++documentoFornecedor) })
    .expect(201);
  return res.body as { id: string };
}

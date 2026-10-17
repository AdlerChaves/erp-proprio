import { INestApplication } from '@nestjs/common';
import { Perfil } from '../src/modules/usuarios/perfil.enum';
import { Acesso, adicionarUsuario, api, criarApp, criarCliente, criarConta, limparBanco, registrarEmpresa, SENHA } from './helpers';

describe('Perfis e gestão de usuários', () => {
  let app: INestApplication;
  let admin: Acesso;

  beforeAll(async () => {
    app = await criarApp();
  });
  beforeEach(async () => {
    await limparBanco(app);
    admin = await registrarEmpresa(app);
  });
  afterAll(() => app.close());

  describe('permissões por perfil', () => {
    type Ctx = { clienteId: string; contaId: string };
    type Operacao = [descricao: string, executar: (token: string, ctx: Ctx) => ReturnType<ReturnType<typeof api>['get']>];

    const operacoes: Record<string, Operacao> = {
      listarClientes: ['listar clientes', (t) => api(app, t).get('/clientes')],
      criarCliente: ['criar cliente', (t) => api(app, t).post('/clientes', { nome: 'Novo', documento: '55555555555' })],
      removerCliente: ['remover cliente sem contas', (t) => api(app, t).delete(`/clientes/${ctxSemContas.clienteId}`)],
      listarContas: ['listar contas', (t) => api(app, t).get('/contas-receber')],
      criarConta: [
        'criar conta',
        (t, c) => api(app, t).post('/contas-receber', { clienteId: c.clienteId, descricao: 'X', valor: 1, dataVencimento: '2099-01-01' }),
      ],
      baixarConta: ['baixar conta', (t, c) => api(app, t).post(`/contas-receber/${c.contaId}/baixa`)],
      listarUsuarios: ['listar usuários', (t) => api(app, t).get('/usuarios')],
      alterarEmpresa: ['alterar empresa', (t) => api(app, t).patch('/empresas/atual', { nomeFantasia: 'Novo nome' })],
    };

    // [perfil, operação, status esperado]
    const matriz: [Perfil, keyof typeof operacoes, number][] = [
      [Perfil.CONSULTA, 'listarClientes', 200],
      [Perfil.CONSULTA, 'listarContas', 200],
      [Perfil.CONSULTA, 'criarCliente', 403],
      [Perfil.CONSULTA, 'criarConta', 403],
      [Perfil.CONSULTA, 'baixarConta', 403],
      [Perfil.CONSULTA, 'listarUsuarios', 403],
      [Perfil.VENDAS, 'criarCliente', 201],
      [Perfil.VENDAS, 'removerCliente', 403],
      [Perfil.VENDAS, 'criarConta', 403],
      [Perfil.VENDAS, 'baixarConta', 403],
      [Perfil.FINANCEIRO, 'criarCliente', 201],
      [Perfil.FINANCEIRO, 'criarConta', 201],
      [Perfil.FINANCEIRO, 'baixarConta', 201],
      [Perfil.FINANCEIRO, 'removerCliente', 403],
      [Perfil.FINANCEIRO, 'listarUsuarios', 403],
      [Perfil.FINANCEIRO, 'alterarEmpresa', 403],
      [Perfil.ADMIN, 'removerCliente', 204],
      [Perfil.ADMIN, 'listarUsuarios', 200],
      [Perfil.ADMIN, 'alterarEmpresa', 200],
    ];

    let ctx: Ctx;
    let ctxSemContas: Ctx;

    beforeEach(async () => {
      const cliente = await criarCliente(app, admin.token);
      ctx = { clienteId: cliente.id, contaId: (await criarConta(app, admin.token, cliente.id)).id };
      ctxSemContas = { clienteId: (await criarCliente(app, admin.token)).id, contaId: '' };
    });

    it.each(matriz)('%s → %s responde %i', async (perfil, operacao, status) => {
      const usuario = await adicionarUsuario(app, admin, perfil);
      await operacoes[operacao][1](usuario.token, ctx).expect(status);
    });
  });

  it('a troca de perfil vale sem novo login', async () => {
    const usuario = await adicionarUsuario(app, admin, Perfil.CONSULTA);
    await api(app, usuario.token).post('/clientes', { nome: 'X', documento: '55555555555' }).expect(403);

    await api(app, admin.token).patch(`/usuarios/${usuario.usuarioId}`, { perfil: Perfil.VENDAS }).expect(200);
    await api(app, usuario.token).post('/clientes', { nome: 'X', documento: '55555555555' }).expect(201);
  });

  it('o bloqueio derruba o token atual e impede novo login', async () => {
    const usuario = await adicionarUsuario(app, admin, Perfil.FINANCEIRO);
    const res = await api(app, admin.token).patch(`/usuarios/${usuario.usuarioId}`, { ativo: false }).expect(200);
    expect(res.body.ativo).toBe(false);

    await api(app, usuario.token).get('/clientes').expect(401);
    await api(app).post('/auth/login', { email: usuario.email, senha: SENHA }).expect(401);
  });

  it('o acesso volta ao desbloquear', async () => {
    const usuario = await adicionarUsuario(app, admin, Perfil.FINANCEIRO);
    await api(app, admin.token).patch(`/usuarios/${usuario.usuarioId}`, { ativo: false }).expect(200);
    await api(app, admin.token).patch(`/usuarios/${usuario.usuarioId}`, { ativo: true }).expect(200);
    await api(app, usuario.token).get('/clientes').expect(200);
  });

  describe('último administrador', () => {
    it('não pode se rebaixar nem se bloquear', async () => {
      await api(app, admin.token).patch(`/usuarios/${admin.usuarioId}`, { perfil: Perfil.CONSULTA }).expect(400);
      await api(app, admin.token).patch(`/usuarios/${admin.usuarioId}`, { ativo: false }).expect(400);
      await api(app, admin.token).get('/usuarios').expect(200);
    });

    it('pode ser rebaixado quando há outro administrador ativo', async () => {
      await adicionarUsuario(app, admin, Perfil.ADMIN);
      await api(app, admin.token).patch(`/usuarios/${admin.usuarioId}`, { perfil: Perfil.CONSULTA }).expect(200);
      await api(app, admin.token).get('/usuarios').expect(403);
    });

    it('um administrador bloqueado não conta como ativo', async () => {
      const outro = await adicionarUsuario(app, admin, Perfil.ADMIN);
      await api(app, admin.token).patch(`/usuarios/${outro.usuarioId}`, { ativo: false }).expect(200);
      await api(app, admin.token).patch(`/usuarios/${admin.usuarioId}`, { perfil: Perfil.CONSULTA }).expect(400);
    });
  });

  describe('adicionar usuário', () => {
    it('exige nome e senha quando o e-mail ainda não tem conta', async () => {
      await api(app, admin.token).post('/usuarios', { email: 'novo@teste.com', perfil: Perfil.VENDAS }).expect(400);
    });

    it('recusa usuário que já tem acesso à empresa', async () => {
      const usuario = await adicionarUsuario(app, admin, Perfil.VENDAS);
      await api(app, admin.token).post('/usuarios', { email: usuario.email, perfil: Perfil.CONSULTA }).expect(409);
    });

    it('a listagem não expõe o hash da senha', async () => {
      await adicionarUsuario(app, admin, Perfil.VENDAS);
      const res = await api(app, admin.token).get('/usuarios').expect(200);
      expect(res.body).toHaveLength(2);
      expect(JSON.stringify(res.body)).not.toMatch(/senha|scrypt/i);
    });
  });
});

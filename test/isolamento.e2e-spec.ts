import { INestApplication } from '@nestjs/common';
import {
  Acesso,
  api,
  criarApp,
  criarCliente,
  criarConta,
  criarContaBancaria,
  limparBanco,
  registrarEmpresa,
} from './helpers';

/** Uma empresa nunca enxerga nem altera dados de outra. */
describe('Isolamento entre empresas', () => {
  let app: INestApplication;
  let a: Acesso;
  let b: Acesso;
  let clienteA: { id: string; documento: string };
  let contaA: { id: string };

  beforeAll(async () => {
    app = await criarApp();
  });
  beforeEach(async () => {
    await limparBanco(app);
    a = await registrarEmpresa(app);
    b = await registrarEmpresa(app);
    clienteA = await criarCliente(app, a.token);
    contaA = await criarConta(app, a.token, clienteA.id);
  });
  afterAll(() => app.close());

  describe('clientes', () => {
    it('a listagem só traz os clientes da própria empresa', async () => {
      await criarCliente(app, b.token);
      const res = await api(app, b.token).get('/clientes').expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).not.toBe(clienteA.id);
    });

    it('não consulta, altera nem remove cliente de outra empresa', async () => {
      await api(app, b.token).get(`/clientes/${clienteA.id}`).expect(404);
      await api(app, b.token).patch(`/clientes/${clienteA.id}`, { nome: 'Invadido' }).expect(404);
      await api(app, b.token).delete(`/clientes/${clienteA.id}`).expect(404);

      const res = await api(app, a.token).get(`/clientes/${clienteA.id}`).expect(200);
      expect(res.body.nome).not.toBe('Invadido');
    });

    it('permite o mesmo documento em empresas diferentes, mas não na mesma', async () => {
      await criarCliente(app, b.token, clienteA.documento);
      await api(app, a.token).post('/clientes', { nome: 'Duplicado', documento: clienteA.documento }).expect(409);
    });

    it('não aceita empresaId no corpo da requisição', async () => {
      await api(app, b.token)
        .post('/clientes', { nome: 'X', documento: '98765432100', empresaId: a.empresaId })
        .expect(400);
    });
  });

  describe('contas a receber', () => {
    it('não lança conta para cliente de outra empresa', async () => {
      await api(app, b.token)
        .post('/contas-receber', { clienteId: clienteA.id, descricao: 'X', valor: 10, dataVencimento: '2099-01-01' })
        .expect(404);
    });

    it('a listagem não traz contas de outra empresa, mesmo filtrando pelo cliente dela', async () => {
      await api(app, b.token).get('/contas-receber').expect(200, []);
      await api(app, b.token).get(`/contas-receber?clienteId=${clienteA.id}`).expect(200, []);
    });

    it('não consulta, altera, baixa nem cancela conta de outra empresa', async () => {
      await api(app, b.token).get(`/contas-receber/${contaA.id}`).expect(404);
      await api(app, b.token).patch(`/contas-receber/${contaA.id}`, { descricao: 'Invadida' }).expect(404);
      const caixaB = await criarContaBancaria(app, b.token);
      await api(app, b.token).post(`/contas-receber/${contaA.id}/baixas`, { contaBancariaId: caixaB.id }).expect(404);
      await api(app, b.token).post(`/contas-receber/${contaA.id}/cancelamento`).expect(404);

      const res = await api(app, a.token).get(`/contas-receber/${contaA.id}`).expect(200);
      expect(res.body).toMatchObject({ status: 'ABERTA', descricao: 'Venda' });
    });
  });

  describe('usuários', () => {
    it('não altera o acesso de usuário de outra empresa', async () => {
      await api(app, b.token).patch(`/usuarios/${a.usuarioId}`, { ativo: false }).expect(404);
      await api(app, a.token).get('/clientes').expect(200);
    });
  });
});

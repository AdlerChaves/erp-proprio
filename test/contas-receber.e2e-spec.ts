import { INestApplication } from '@nestjs/common';
import { hoje } from '../src/common/datas';
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

describe('Contas a receber', () => {
  let app: INestApplication;
  let a: Acesso;
  let clienteId: string;
  /** Contas do plano padrão de A, pelo código. */
  let plano: Record<string, string>;

  beforeAll(async () => {
    app = await criarApp();
  });
  beforeEach(async () => {
    await limparBanco(app);
    a = await registrarEmpresa(app);
    clienteId = (await criarCliente(app, a.token)).id;
    const { body } = await api(app, a.token).get('/plano-contas').expect(200);
    plano = Object.fromEntries(body.map((c: { codigo: string; id: string }) => [c.codigo, c.id]));
  });
  afterAll(() => app.close());

  const novaConta = (extra: object = {}) =>
    api(app, a.token).post('/contas-receber', {
      clienteId,
      descricao: 'Venda',
      valor: 100,
      dataVencimento: '2099-01-10',
      ...extra,
    });

  describe('plano de contas padrão', () => {
    it('é criado no cadastro da empresa, com receitas e despesas em árvore', async () => {
      const { body } = await api(app, a.token).get('/plano-contas').expect(200);
      const porCodigo = Object.fromEntries(body.map((c: { codigo: string }) => [c.codigo, c]));

      expect(body.length).toBeGreaterThanOrEqual(20);
      expect(porCodigo['1']).toMatchObject({ tipo: 'RECEITA', aceitaLancamento: false, contaPaiId: null });
      expect(porCodigo['1.01']).toMatchObject({ tipo: 'RECEITA', aceitaLancamento: true, contaPaiId: plano['1'] });
      expect(porCodigo['2.03']).toMatchObject({ tipo: 'DESPESA', aceitaLancamento: false, contaPaiId: plano['2'] });
      expect(porCodigo['2.03.01']).toMatchObject({ tipo: 'DESPESA', aceitaLancamento: true, contaPaiId: plano['2.03'] });
    });

    it('também é criado para empresa aberta por um usuário já logado', async () => {
      const nova = await api(app, a.token).post('/empresas', { razaoSocial: 'Filial', cnpj: '33333333000133' }).expect(201);
      const troca = await api(app, a.token).post('/auth/trocar-empresa', { empresaId: nova.body.id }).expect(200);
      const { body } = await api(app, troca.body.accessToken).get('/plano-contas').expect(200);
      expect(body.map((c: { codigo: string }) => c.codigo)).toContain('1.01');
      expect(body.map((c: { id: string }) => c.id)).not.toContain(plano['1.01']);
    });

    it('pode ser editado e ampliado pela empresa', async () => {
      await api(app, a.token).patch(`/plano-contas/${plano['1.04']}`, { nome: 'Aluguéis recebidos' }).expect(200);
      await api(app, a.token)
        .post('/plano-contas', { codigo: '2.03.06', nome: 'Seguros', tipo: 'DESPESA', contaPaiId: plano['2.03'] })
        .expect(201);
    });
  });

  describe('categoria e centro de custo', () => {
    it('a categoria é opcional', async () => {
      const res = await novaConta().expect(201);
      expect(res.body).toMatchObject({ planoContaId: null, planoConta: null, centroCustoId: null });
    });

    it('aceita categoria de receita analítica e centro de custo, e devolve os dois', async () => {
      const centro = await api(app, a.token).post('/centros-custo', { nome: 'Loja' }).expect(201);
      const res = await novaConta({ planoContaId: plano['1.01'], centroCustoId: centro.body.id }).expect(201);
      expect(res.body).toMatchObject({
        planoConta: { codigo: '1.01', nome: 'Venda de produtos' },
        centroCusto: { nome: 'Loja' },
        cliente: { id: clienteId },
      });
    });

    it('recusa categoria de despesa, sintética ou inativa', async () => {
      await novaConta({ planoContaId: plano['2.03.01'] }).expect(400);
      await novaConta({ planoContaId: plano['1'] }).expect(400);
      await api(app, a.token).patch(`/plano-contas/${plano['1.04']}`, { ativo: false }).expect(200);
      await novaConta({ planoContaId: plano['1.04'] }).expect(400);
    });

    it('recusa centro de custo inativo', async () => {
      const centro = await api(app, a.token).post('/centros-custo', { nome: 'Antigo', ativo: false }).expect(201);
      await novaConta({ centroCustoId: centro.body.id }).expect(400);
    });

    it('recusa categoria e centro de custo de outra empresa', async () => {
      const b = await registrarEmpresa(app);
      const planoB = await api(app, b.token).get('/plano-contas').expect(200);
      const vendasB = planoB.body.find((c: { codigo: string }) => c.codigo === '1.01').id;
      const centroB = await api(app, b.token).post('/centros-custo', { nome: 'Loja B' }).expect(201);

      await novaConta({ planoContaId: vendasB }).expect(404);
      await novaConta({ centroCustoId: centroB.body.id }).expect(404);
    });

    it('classifica, troca e remove a categoria depois de criada', async () => {
      const { body } = await novaConta().expect(201);
      const rota = `/contas-receber/${body.id}`;

      let res = await api(app, a.token).patch(rota, { planoContaId: plano['1.01'] }).expect(200);
      expect(res.body.planoConta.codigo).toBe('1.01');
      res = await api(app, a.token).patch(rota, { planoContaId: plano['1.02'] }).expect(200);
      expect(res.body.planoConta.codigo).toBe('1.02');
      res = await api(app, a.token).patch(rota, { planoContaId: null }).expect(200);
      expect(res.body).toMatchObject({ planoContaId: null, planoConta: null });
    });

    it('filtra por categoria e por centro de custo', async () => {
      const centro = await api(app, a.token).post('/centros-custo', { nome: 'Loja' }).expect(201);
      const vendas = await novaConta({ planoContaId: plano['1.01'], centroCustoId: centro.body.id }).expect(201);
      await novaConta({ planoContaId: plano['1.02'] }).expect(201);
      await novaConta().expect(201);

      const porCategoria = await api(app, a.token).get(`/contas-receber?planoContaId=${plano['1.01']}`).expect(200);
      expect(porCategoria.body.map((c: { id: string }) => c.id)).toEqual([vendas.body.id]);
      const porCentro = await api(app, a.token).get(`/contas-receber?centroCustoId=${centro.body.id}`).expect(200);
      expect(porCentro.body.map((c: { id: string }) => c.id)).toEqual([vendas.body.id]);
    });

    it('a categoria em uso não pode ser removida do plano', async () => {
      await novaConta({ planoContaId: plano['1.01'] }).expect(201);
      await api(app, a.token).delete(`/plano-contas/${plano['1.01']}`).expect(409);
    });
  });

  describe('baixa', () => {
    it('exige a conta bancária de entrada', async () => {
      const conta = await criarConta(app, a.token, clienteId);
      const res = await api(app, a.token).post(`/contas-receber/${conta.id}/baixas`).expect(400);
      expect(res.body.message.join()).toMatch(/contaBancariaId/);
    });

    it('quita o saldo por padrão, com a data de hoje e a conta bancária informada', async () => {
      const conta = await criarConta(app, a.token, clienteId);
      const caixa = await criarContaBancaria(app, a.token);
      const res = await api(app, a.token)
        .post(`/contas-receber/${conta.id}/baixas`, { contaBancariaId: caixa.id })
        .expect(201);
      expect(res.body).toMatchObject({ status: 'PAGA', valorBaixado: 150.5, saldo: 0 });
      expect(res.body.baixas[0]).not.toHaveProperty('seq');
      expect(res.body.baixas).toEqual([
        expect.objectContaining({
          contaBancariaId: caixa.id,
          contaBancaria: expect.objectContaining({ id: caixa.id }),
          valor: 150.5,
          juros: 0,
          multa: 0,
          desconto: 0,
          valorTotal: 150.5,
          data: hoje(),
        }),
      ]);
    });

    it('aceita juros, multa e desconto e data informada', async () => {
      const conta = await criarConta(app, a.token, clienteId);
      const caixa = await criarContaBancaria(app, a.token);
      const res = await api(app, a.token)
        .post(`/contas-receber/${conta.id}/baixas`, {
          contaBancariaId: caixa.id,
          juros: 4.4,
          multa: 3.01,
          desconto: 2,
          data: '2099-01-12',
        })
        .expect(201);
      expect(res.body.status).toBe('PAGA');
      expect(res.body.baixas[0]).toMatchObject({ valor: 150.5, valorTotal: 155.91, data: '2099-01-12' });
    });

    it('recusa conta bancária inativa ou de outra empresa', async () => {
      const conta = await criarConta(app, a.token, clienteId);
      const inativa = await criarContaBancaria(app, a.token);
      await api(app, a.token).patch(`/contas-bancarias/${inativa.id}`, { ativo: false }).expect(200);
      const b = await registrarEmpresa(app);
      const caixaB = await criarContaBancaria(app, b.token);

      await api(app, a.token).post(`/contas-receber/${conta.id}/baixas`, { contaBancariaId: inativa.id }).expect(400);
      await api(app, a.token).post(`/contas-receber/${conta.id}/baixas`, { contaBancariaId: caixaB.id }).expect(404);
      const atual = await api(app, a.token).get(`/contas-receber/${conta.id}`).expect(200);
      expect(atual.body).toMatchObject({ status: 'ABERTA', baixas: [] });
    });

    it('a conta bancária com recebimentos não pode ser removida', async () => {
      const conta = await criarConta(app, a.token, clienteId);
      const caixa = await criarContaBancaria(app, a.token);
      await api(app, a.token).post(`/contas-receber/${conta.id}/baixas`, { contaBancariaId: caixa.id }).expect(201);
      await api(app, a.token).delete(`/contas-bancarias/${caixa.id}`).expect(409);
    });
  });

  describe('conta paga ou cancelada', () => {
    let contaId: string;
    let caixaId: string;

    beforeEach(async () => {
      contaId = (await criarConta(app, a.token, clienteId)).id;
      caixaId = (await criarContaBancaria(app, a.token)).id;
    });

    it('não recebe nova baixa nem cancelamento', async () => {
      await api(app, a.token).post(`/contas-receber/${contaId}/baixas`, { contaBancariaId: caixaId }).expect(201);
      await api(app, a.token).post(`/contas-receber/${contaId}/baixas`, { contaBancariaId: caixaId }).expect(400);
      await api(app, a.token).post(`/contas-receber/${contaId}/cancelamento`).expect(400);
    });

    it('cancelada não pode ser baixada', async () => {
      await api(app, a.token).post(`/contas-receber/${contaId}/cancelamento`).expect(201);
      await api(app, a.token).post(`/contas-receber/${contaId}/baixas`, { contaBancariaId: caixaId }).expect(400);
    });

    it('ainda pode ser classificada, mas não ter outros campos alterados', async () => {
      await api(app, a.token).post(`/contas-receber/${contaId}/baixas`, { contaBancariaId: caixaId }).expect(201);
      const rota = `/contas-receber/${contaId}`;

      const res = await api(app, a.token).patch(rota, { planoContaId: plano['1.01'] }).expect(200);
      expect(res.body).toMatchObject({ status: 'PAGA', planoConta: { codigo: '1.01' }, saldo: 0 });

      await api(app, a.token).patch(rota, { valor: 1 }).expect(400);
      await api(app, a.token).patch(rota, { planoContaId: plano['1.02'], descricao: 'Outra' }).expect(400);
      const atual = await api(app, a.token).get(rota).expect(200);
      expect(atual.body).toMatchObject({ valor: 150.5, descricao: 'Venda', planoConta: { codigo: '1.01' } });
    });
  });

  describe('datas', () => {
    it('não aceita vencimento antes da emissão, ao criar nem ao alterar', async () => {
      await novaConta({ dataEmissao: '2099-02-01', dataVencimento: '2099-01-31' }).expect(400);
      const { body } = await novaConta({ dataEmissao: '2099-01-01' }).expect(201);
      await api(app, a.token).patch(`/contas-receber/${body.id}`, { dataVencimento: '2098-12-31' }).expect(400);
    });

    it('usa hoje como emissão padrão e filtra por período de vencimento', async () => {
      const jan = await novaConta({ dataVencimento: '2099-01-10' }).expect(201);
      await novaConta({ dataVencimento: '2099-03-10' }).expect(201);
      expect(jan.body.dataEmissao).toBe(hoje());

      const res = await api(app, a.token)
        .get('/contas-receber?vencimentoDe=2099-01-01&vencimentoAte=2099-01-31')
        .expect(200);
      expect(res.body.map((c: { id: string }) => c.id)).toEqual([jan.body.id]);
    });
  });
});

import { INestApplication } from '@nestjs/common';
import { Perfil } from '../src/modules/usuarios/perfil.enum';
import {
  Acesso,
  adicionarUsuario,
  api,
  criarApp,
  criarCliente,
  criarFornecedor,
  limparBanco,
  registrarEmpresa,
} from './helpers';

describe('Financeiro: baixas parciais, parcelamento, fluxo de caixa e DRE', () => {
  let app: INestApplication;
  let a: Acesso;
  let clienteId: string;
  let fornecedorId: string;
  /** Conta corrente com saldo inicial de 1.000,00 em 2026-01-01. */
  let banco: string;
  let plano: Record<string, string>;

  beforeAll(async () => {
    app = await criarApp();
  });
  beforeEach(async () => {
    await limparBanco(app);
    a = await registrarEmpresa(app);
    clienteId = (await criarCliente(app, a.token)).id;
    fornecedorId = (await criarFornecedor(app, a.token)).id;
    banco = (
      await api(app, a.token)
        .post('/contas-bancarias', {
          nome: 'Banco',
          tipo: 'CORRENTE',
          banco: '341',
          agencia: '1',
          numero: '1',
          saldoInicial: 1000,
          dataSaldoInicial: '2026-01-01',
        })
        .expect(201)
    ).body.id;
    const { body } = await api(app, a.token).get('/plano-contas').expect(200);
    plano = Object.fromEntries(body.map((c: { codigo: string; id: string }) => [c.codigo, c.id]));
  });
  afterAll(() => app.close());

  const receber = (dados: object = {}) =>
    api(app, a.token)
      .post('/contas-receber', { clienteId, descricao: 'Venda', valor: 1000, dataVencimento: '2099-01-10', ...dados })
      .expect(201)
      .then((r) => r.body);
  const pagar = (dados: object = {}) =>
    api(app, a.token)
      .post('/contas-pagar', { fornecedorId, descricao: 'Compra', valor: 300, dataVencimento: '2099-02-05', ...dados })
      .expect(201)
      .then((r) => r.body);
  const baixar = (tipo: 'receber' | 'pagar', id: string, dados: object = {}) =>
    api(app, a.token).post(`/contas-${tipo}/${id}/baixas`, { contaBancariaId: banco, ...dados });

  describe('baixas parciais', () => {
    it('a conta fica PARCIAL até quitar o saldo, com uma movimentação por baixa', async () => {
      const conta = await receber();
      let res = await baixar('receber', conta.id, { valor: 300, data: '2026-03-01' }).expect(201);
      expect(res.body).toMatchObject({ status: 'PARCIAL', valorBaixado: 300, saldo: 700 });

      res = await baixar('receber', conta.id, { data: '2026-03-15' }).expect(201);
      expect(res.body).toMatchObject({ status: 'PAGA', valorBaixado: 1000, saldo: 0 });
      expect(res.body.baixas.map((b: { valor: number; data: string }) => [b.valor, b.data])).toEqual([
        [300, '2026-03-01'],
        [700, '2026-03-15'],
      ]);

      const movs = await api(app, a.token).get('/movimentacoes').expect(200);
      expect(movs.body.map((m: { valor: number }) => m.valor)).toEqual([300, 700]);
    });

    it('não aceita valor acima do saldo nem baixa em conta paga', async () => {
      const conta = await receber();
      await baixar('receber', conta.id, { valor: 600 }).expect(201);
      const res = await baixar('receber', conta.id, { valor: 400.01 }).expect(400);
      expect(res.body.message).toMatch(/excede o saldo em aberto de 400/);
      await baixar('receber', conta.id).expect(201);
      await baixar('receber', conta.id, { valor: 1 }).expect(400);
    });

    it('juros e multa somam e o desconto abate no valor movimentado', async () => {
      const conta = await pagar();
      const res = await baixar('pagar', conta.id, { valor: 100, juros: 2.5, multa: 2, desconto: 0.75 }).expect(201);
      expect(res.body).toMatchObject({ status: 'PARCIAL', saldo: 200 });
      expect(res.body.baixas[0]).toMatchObject({ valor: 100, juros: 2.5, multa: 2, desconto: 0.75, valorTotal: 103.75 });
      const [mov] = (await api(app, a.token).get('/movimentacoes').expect(200)).body;
      expect(mov).toMatchObject({ tipo: 'SAIDA', valor: 103.75 });
    });

    it('o desconto não pode zerar a baixa', async () => {
      const conta = await receber();
      await baixar('receber', conta.id, { valor: 50, desconto: 50 }).expect(400);
    });

    it('estornar uma baixa recalcula o status e remove só a movimentação dela', async () => {
      const conta = await receber();
      await baixar('receber', conta.id, { valor: 200 }).expect(201);
      const { body } = await baixar('receber', conta.id).expect(201);
      const [primeira, segunda] = body.baixas;

      let res = await api(app, a.token).delete(`/contas-receber/${conta.id}/baixas/${segunda.id}`).expect(200);
      expect(res.body).toMatchObject({ status: 'PARCIAL', saldo: 800 });
      expect((await api(app, a.token).get('/movimentacoes').expect(200)).body).toHaveLength(1);

      res = await api(app, a.token).delete(`/contas-receber/${conta.id}/baixas/${primeira.id}`).expect(200);
      expect(res.body).toMatchObject({ status: 'ABERTA', saldo: 1000, baixas: [] });
      await api(app, a.token).delete(`/contas-receber/${conta.id}/baixas/${primeira.id}`).expect(404);
    });

    it('só cancela conta sem baixas', async () => {
      const conta = await receber();
      const { body } = await baixar('receber', conta.id, { valor: 10 }).expect(201);
      await api(app, a.token).post(`/contas-receber/${conta.id}/cancelamento`).expect(400);
      await api(app, a.token).delete(`/contas-receber/${conta.id}/baixas/${body.baixas[0].id}`).expect(200);
      await api(app, a.token).post(`/contas-receber/${conta.id}/cancelamento`).expect(201);
      await api(app, a.token).post(`/contas-receber/${conta.id}/cancelamento`).expect(400);
      await baixar('receber', conta.id).expect(400);
    });

    it('conta parcial só tem a classificação alterável', async () => {
      const conta = await receber();
      await baixar('receber', conta.id, { valor: 10 }).expect(201);
      await api(app, a.token).patch(`/contas-receber/${conta.id}`, { valor: 5000 }).expect(400);
      await api(app, a.token).patch(`/contas-receber/${conta.id}`, { planoContaId: plano['1.01'] }).expect(200);
    });

    it('baixas simultâneas não ultrapassam o saldo', async () => {
      const conta = await receber();
      // Seis baixas de 300 ao mesmo tempo numa conta de 1.000: só três cabem.
      const respostas = await Promise.all(Array.from({ length: 6 }, () => baixar('receber', conta.id, { valor: 300 })));
      expect(respostas.map((r) => r.status).sort()).toEqual([201, 201, 201, 400, 400, 400]);
      const atual = await api(app, a.token).get(`/contas-receber/${conta.id}`).expect(200);
      expect(atual.body).toMatchObject({ status: 'PARCIAL', valorBaixado: 900, saldo: 100 });
      expect((await api(app, a.token).get('/movimentacoes').expect(200)).body).toHaveLength(3);
    });
  });

  describe('parcelamento', () => {
    const parcelar = (dados: object) =>
      api(app, a.token).post('/contas-receber/parcelamentos', {
        clienteId,
        descricao: 'Venda parcelada',
        valor: 100,
        dataEmissao: '2027-01-15',
        dataVencimento: '2027-01-31',
        parcelas: 3,
        ...dados,
      });

    it('divide o valor sem perder centavos e vence mês a mês, ajustando o fim do mês', async () => {
      const { body } = await parcelar({ planoContaId: plano['1.01'] }).expect(201);
      expect(
        body.map((p: { descricao: string; valor: number; dataVencimento: string; parcela: number; totalParcelas: number }) => [
          p.descricao,
          p.valor,
          p.dataVencimento,
          p.parcela,
          p.totalParcelas,
        ]),
      ).toEqual([
        ['Venda parcelada (1/3)', 33.34, '2027-01-31', 1, 3],
        ['Venda parcelada (2/3)', 33.33, '2027-02-28', 2, 3],
        ['Venda parcelada (3/3)', 33.33, '2027-03-31', 3, 3],
      ]);
      expect(new Set(body.map((p: { parcelamentoId: string }) => p.parcelamentoId)).size).toBe(1);
      expect(body.every((p: { planoContaId: string; status: string }) => p.planoContaId === plano['1.01'] && p.status === 'ABERTA')).toBe(true);
    });

    it('lista as parcelas pelo parcelamentoId e cada uma é baixada separadamente', async () => {
      const { body } = await parcelar({}).expect(201);
      await parcelar({ descricao: 'Outra' }).expect(201);

      const lista = await api(app, a.token).get(`/contas-receber?parcelamentoId=${body[0].parcelamentoId}`).expect(200);
      expect(lista.body.map((p: { id: string }) => p.id)).toEqual(body.map((p: { id: string }) => p.id));

      const res = await baixar('receber', body[0].id, { data: '2027-01-31' }).expect(201);
      expect(res.body.status).toBe('PAGA');
      const segunda = await api(app, a.token).get(`/contas-receber/${body[1].id}`).expect(200);
      expect(segunda.body.status).toBe('ABERTA');
    });

    it('valida número de parcelas, valor mínimo e cliente da empresa', async () => {
      await parcelar({ parcelas: 1 }).expect(400);
      await parcelar({ parcelas: 121 }).expect(400);
      await parcelar({ parcelas: 2.5 }).expect(400);
      await parcelar({ valor: 0.02 }).expect(400);
      const b = await registrarEmpresa(app);
      const clienteB = await criarCliente(app, b.token);
      await parcelar({ clienteId: clienteB.id }).expect(404);
      await api(app, a.token).get('/contas-receber').expect(200, []);
    });

    it('também funciona em contas a pagar', async () => {
      const res = await api(app, a.token)
        .post('/contas-pagar/parcelamentos', {
          fornecedorId,
          descricao: 'Equipamento',
          valor: 1200,
          dataVencimento: '2099-01-10',
          parcelas: 12,
          planoContaId: plano['2.01.01'],
        })
        .expect(201);
      expect(res.body).toHaveLength(12);
      expect(res.body[11]).toMatchObject({ valor: 100, dataVencimento: '2099-12-10', descricao: 'Equipamento (12/12)' });
    });
  });

  describe('fluxo de caixa', () => {
    it('separa realizado e previsto, ignora transferências e acumula o saldo', async () => {
      const caixa = (
        await api(app, a.token)
          .post('/contas-bancarias', { nome: 'Caixa', tipo: 'CAIXA', saldoInicial: 0, dataSaldoInicial: '2026-01-01' })
          .expect(201)
      ).body.id;
      const parcial = await receber({ valor: 300, dataEmissao: '2026-02-01', dataVencimento: '2099-01-20' });
      await baixar('receber', parcial.id, { valor: 100, data: '2026-03-05' }).expect(201);
      await api(app, a.token)
        .post('/movimentacoes', { contaBancariaId: banco, tipo: 'SAIDA', valor: 10, descricao: 'Tarifa', data: '2026-03-06' })
        .expect(201);
      await api(app, a.token)
        .post('/movimentacoes/transferencias', { contaOrigemId: banco, contaDestinoId: caixa, valor: 50, data: '2026-03-07' })
        .expect(201);
      await receber({ valor: 500, dataVencimento: '2099-01-10' });
      await pagar({ valor: 200, dataVencimento: '2099-02-05' });

      const marco = await api(app, a.token).get('/financeiro/fluxo-caixa?de=2026-03-01&ate=2026-04-30').expect(200);
      expect(marco.body).toMatchObject({ saldoInicial: 1000, saldoFinal: 1090, agrupamento: 'mes' });
      expect(marco.body.periodos).toEqual([
        { periodo: '2026-03', realizado: { entradas: 100, saidas: 10 }, previsto: { entradas: 0, saidas: 0 }, saldo: 1090 },
        { periodo: '2026-04', realizado: { entradas: 0, saidas: 0 }, previsto: { entradas: 0, saidas: 0 }, saldo: 1090 },
      ]);

      const futuro = await api(app, a.token).get('/financeiro/fluxo-caixa?de=2099-01-01&ate=2099-02-28').expect(200);
      expect(futuro.body.saldoInicial).toBe(1090);
      expect(futuro.body.periodos.map((p: { previsto: object; saldo: number }) => [p.previsto, p.saldo])).toEqual([
        [{ entradas: 700, saidas: 0 }, 1790],
        [{ entradas: 0, saidas: 200 }, 1590],
      ]);
      expect(futuro.body.totais.previsto).toEqual({ entradas: 700, saidas: 200 });
    });

    it('agrupa por dia e informa contas em atraso', async () => {
      await receber({ valor: 80, dataEmissao: '2026-01-01', dataVencimento: '2026-02-01' });
      await pagar({ valor: 30, dataEmissao: '2026-01-01', dataVencimento: '2026-02-02' });
      const { body } = await api(app, a.token)
        .get('/financeiro/fluxo-caixa?de=2026-02-01&ate=2026-02-03&agrupamento=dia')
        .expect(200);
      expect(body.periodos.map((p: { periodo: string; previsto: object }) => [p.periodo, p.previsto])).toEqual([
        ['2026-02-01', { entradas: 80, saidas: 0 }],
        ['2026-02-02', { entradas: 0, saidas: 30 }],
        ['2026-02-03', { entradas: 0, saidas: 0 }],
      ]);
      expect(body.emAtraso).toEqual({ receber: 80, pagar: 30 });
    });

    it('valida o período', async () => {
      await api(app, a.token).get('/financeiro/fluxo-caixa?de=2026-03-01&ate=2026-02-01').expect(400);
      await api(app, a.token).get('/financeiro/fluxo-caixa?de=2026-01-01&ate=2027-01-02&agrupamento=dia').expect(400);
      await api(app, a.token).get('/financeiro/fluxo-caixa?de=2026-01-01').expect(400);
    });
  });

  describe('DRE', () => {
    beforeEach(async () => {
      const emMaio = { dataEmissao: '2026-05-10', dataVencimento: '2026-06-10' };
      const vendas = await receber({ ...emMaio, valor: 1000, planoContaId: plano['1.01'] });
      await receber({ ...emMaio, valor: 500, planoContaId: plano['1.02'] });
      await receber({ ...emMaio, valor: 200 });
      await pagar({ ...emMaio, valor: 300, planoContaId: plano['2.03.01'] });
      await pagar({ ...emMaio, valor: 100, planoContaId: plano['2.06.01'] });
      const cancelada = await receber({ ...emMaio, valor: 9999, planoContaId: plano['1.01'] });
      await api(app, a.token).post(`/contas-receber/${cancelada.id}/cancelamento`).expect(201);
      await receber({ dataEmissao: '2026-06-01', dataVencimento: '2026-06-10', valor: 7777, planoContaId: plano['1.01'] });
      await api(app, a.token)
        .post('/movimentacoes', {
          contaBancariaId: banco,
          tipo: 'SAIDA',
          valor: 15,
          descricao: 'Tarifa',
          data: '2026-05-20',
          planoContaId: plano['2.06.01'],
        })
        .expect(201);
      await baixar('receber', vendas.id, { valor: 400, juros: 10, data: '2026-05-25' }).expect(201);
    });

    it('por competência: contas pela emissão, somadas até as contas sintéticas', async () => {
      const { body } = await api(app, a.token).get('/financeiro/dre?de=2026-05-01&ate=2026-05-31').expect(200);
      expect(body.contas.map((c: { codigo: string; nivel: number; valor: number }) => [c.codigo, c.nivel, c.valor])).toEqual([
        ['1', 1, 1500],
        ['1.01', 2, 1000],
        ['1.02', 2, 500],
        ['2', 1, 415],
        ['2.03', 2, 300],
        ['2.03.01', 3, 300],
        ['2.06', 2, 115],
        ['2.06.01', 3, 115],
      ]);
      expect(body).toMatchObject({
        regime: 'competencia',
        semCategoria: { receitas: 200, despesas: 0 },
        receitas: 1700,
        despesas: 415,
        resultado: 1285,
      });
    });

    it('por caixa: baixas pelo valor efetivamente pago, mais as avulsas', async () => {
      const { body } = await api(app, a.token).get('/financeiro/dre?de=2026-05-01&ate=2026-05-31&regime=caixa').expect(200);
      expect(body.contas.map((c: { codigo: string; valor: number }) => [c.codigo, c.valor])).toEqual([
        ['1', 410],
        ['1.01', 410],
        ['2', 15],
        ['2.06', 15],
        ['2.06.01', 15],
      ]);
      expect(body).toMatchObject({ receitas: 410, despesas: 15, resultado: 395 });
    });

    it('não mistura dados de outra empresa', async () => {
      const b = await registrarEmpresa(app);
      const { body } = await api(app, b.token).get('/financeiro/dre?de=2026-05-01&ate=2026-05-31').expect(200);
      expect(body).toMatchObject({ contas: [], receitas: 0, despesas: 0, resultado: 0 });
      const fluxo = await api(app, b.token).get('/financeiro/fluxo-caixa?de=2026-05-01&ate=2026-06-30').expect(200);
      expect(fluxo.body).toMatchObject({ saldoInicial: 0, saldoFinal: 0, emAtraso: { receber: 0, pagar: 0 } });
    });
  });

  describe('permissões dos relatórios', () => {
    it.each([
      [Perfil.VENDAS, 403],
      [Perfil.CONSULTA, 200],
      [Perfil.FINANCEIRO, 200],
    ])('perfil %s: %i', async (perfil, status) => {
      const usuario = await adicionarUsuario(app, a, perfil);
      await api(app, usuario.token).get('/financeiro/fluxo-caixa?de=2026-01-01&ate=2026-12-31').expect(status);
      await api(app, usuario.token).get('/financeiro/dre?de=2026-01-01&ate=2026-12-31').expect(status);
    });
  });
});

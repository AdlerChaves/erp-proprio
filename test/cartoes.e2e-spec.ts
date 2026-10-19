import { INestApplication } from '@nestjs/common';
import { competenciaDaCompra, datasPadrao, diaNoMes, somarCompetencia } from '../src/modules/cartoes/calendario';
import { Perfil } from '../src/modules/usuarios/perfil.enum';
import { Acesso, adicionarUsuario, api, criarApp, criarContaBancaria, criarFornecedor, limparBanco, registrarEmpresa } from './helpers';

describe('Calendário das faturas', () => {
  it('fecha no mês anterior quando o dia do fechamento é maior que o do vencimento', () => {
    expect(datasPadrao({ diaFechamento: 28, diaVencimento: 5 }, '2026-11')).toEqual({ dataFechamento: '2026-10-28', dataVencimento: '2026-11-05' });
    expect(datasPadrao({ diaFechamento: 3, diaVencimento: 10 }, '2026-11')).toEqual({ dataFechamento: '2026-11-03', dataVencimento: '2026-11-10' });
  });

  it('usa o último dia quando o mês é curto, e vira o ano', () => {
    expect(diaNoMes('2026-02', 31)).toBe('2026-02-28');
    expect(datasPadrao({ diaFechamento: 31, diaVencimento: 10 }, '2026-03').dataFechamento).toBe('2026-02-28');
    expect(somarCompetencia('2026-12', 1)).toBe('2027-01');
    expect(somarCompetencia('2027-01', -1)).toBe('2026-12');
  });

  it('a compra no dia do fechamento vai para a fatura seguinte', () => {
    const fechamento = (c: string) => datasPadrao({ diaFechamento: 28, diaVencimento: 5 }, c).dataFechamento;
    expect(competenciaDaCompra('2026-10-27', fechamento)).toBe('2026-11');
    expect(competenciaDaCompra('2026-10-28', fechamento)).toBe('2026-12');
    expect(competenciaDaCompra('2026-10-01', fechamento)).toBe('2026-11');
    expect(competenciaDaCompra('2026-12-27', fechamento)).toBe('2027-01');
    expect(competenciaDaCompra('2026-12-31', fechamento)).toBe('2027-02');
  });
});

describe('Cartões de crédito', () => {
  let app: INestApplication;
  let a: Acesso;
  let banco: string;
  let emissor: string;
  let plano: Record<string, string>;
  let cartao: string;

  beforeAll(async () => {
    app = await criarApp();
  });
  beforeEach(async () => {
    await limparBanco(app);
    a = await registrarEmpresa(app);
    banco = (await criarContaBancaria(app, a.token)).id;
    emissor = (await criarFornecedor(app, a.token)).id;
    const { body } = await api(app, a.token).get('/plano-contas').expect(200);
    plano = Object.fromEntries(body.map((c: { codigo: string; id: string }) => [c.codigo, c.id]));
    // Fecha dia 28, vence dia 5: a fatura de novembro reúne as compras de 28/09 a 27/10.
    cartao = (
      await api(app, a.token)
        .post('/cartoes', { nome: 'Itaú Visa', final: '1234', contaBancariaId: banco, fornecedorId: emissor, diaFechamento: 28, diaVencimento: 5, limite: 5000 })
        .expect(201)
    ).body.id;
  });
  afterAll(() => app.close());

  const lancar = (dados: object, token = a.token) =>
    api(app, token).post(`/cartoes/${cartao}/lancamentos`, { descricao: 'Compra', valor: 100, data: '2026-10-10', ...dados });
  const fatura = async (competencia: string) => (await api(app, a.token).get(`/cartoes/${cartao}/faturas/${competencia}`).expect(200)).body;
  const contas = async () =>
    (await api(app, a.token).get('/contas-pagar').expect(200)).body as {
      id: string;
      valor: number;
      dataVencimento: string;
      descricao: string;
      fornecedorId: string;
      status: string;
    }[];
  const total = async (competencia: string) => (await fatura(competencia)).total;

  describe('cadastro', () => {
    it('valida dias, conta bancária e emissor da própria empresa', async () => {
      const base = { nome: 'Outro', contaBancariaId: banco, fornecedorId: emissor, diaFechamento: 3, diaVencimento: 10 };
      await api(app, a.token).post('/cartoes', { ...base, diaFechamento: 32 }).expect(400);
      await api(app, a.token).post('/cartoes', { ...base, final: '12345' }).expect(400);
      await api(app, a.token).post('/cartoes', { ...base, nome: 'Itaú Visa' }).expect(409);
      const b = await registrarEmpresa(app);
      await api(app, b.token).post('/cartoes', base).expect(404);
    });

    it('mostra a fatura atual e o limite disponível', async () => {
      await lancar({ valor: 1200 }).expect(201);
      const { body } = await api(app, a.token).get(`/cartoes/${cartao}`).expect(200);
      expect(body).toMatchObject({ nome: 'Itaú Visa', limite: 5000, limiteUsado: 1200, limiteDisponivel: 3800 });
      expect(body.faturaAtual).toMatch(/^\d{4}-\d{2}$/);
      expect(body.contaBancaria.id).toBe(banco);
    });
  });

  describe('lançamentos e conta a pagar', () => {
    it('a primeira compra cria a conta a pagar da fatura, e as seguintes atualizam o valor', async () => {
      const { body } = await lancar({ descricao: 'Material de escritório', valor: 150.5, planoContaId: plano['2.03.04'] }).expect(201);
      expect(body).toEqual([expect.objectContaining({ valor: 150.5, parcela: null, fatura: expect.objectContaining({ competencia: '2026-11' }) })]);

      let lista = await contas();
      expect(lista).toEqual([
        expect.objectContaining({ valor: 150.5, dataVencimento: '2026-11-05', descricao: 'Fatura Itaú Visa nov/2026', fornecedorId: emissor, status: 'ABERTA' }),
      ]);
      await lancar({ valor: 49.5, data: '2026-10-27' }).expect(201);
      lista = await contas();
      expect(lista).toHaveLength(1);
      expect(lista[0].valor).toBe(200);
      expect(await total('2026-11')).toBe(200);
    });

    it('compra parcelada: uma parcela em cada fatura, cada uma com sua conta', async () => {
      const { body } = await lancar({ descricao: 'Notebook', valor: 100, parcelas: 3 }).expect(201);
      expect(body.map((l: { parcela: number; valor: number; fatura: { competencia: string } }) => [l.parcela, l.valor, l.fatura.competencia])).toEqual([
        [1, 33.34, '2026-11'],
        [2, 33.33, '2026-12'],
        [3, 33.33, '2027-01'],
      ]);
      expect((await contas()).map((c) => [c.dataVencimento, c.valor])).toEqual([
        ['2026-11-05', 33.34],
        ['2026-12-05', 33.33],
        ['2027-01-05', 33.33],
      ]);
    });

    it('estorno desconta; fatura que zera ou só tem estorno não tem conta a pagar', async () => {
      const compra = (await lancar({ valor: 300 }).expect(201)).body[0];
      await lancar({ valor: 100, tipo: 'ESTORNO', descricao: 'Devolução' }).expect(201);
      expect((await contas())[0].valor).toBe(200);

      await api(app, a.token).delete(`/cartoes/${cartao}/lancamentos/${compra.id}`).expect(204);
      expect(await total('2026-11')).toBe(-100);
      expect(await contas()).toEqual([]);
      await lancar({ valor: 50, tipo: 'ESTORNO', parcelas: 2 }).expect(400);
    });

    it('excluir uma parcela exclui a compra inteira', async () => {
      const parcelas = (await lancar({ valor: 90, parcelas: 3 }).expect(201)).body;
      await api(app, a.token).delete(`/cartoes/${cartao}/lancamentos/${parcelas[1].id}`).expect(204);
      for (const c of ['2026-11', '2026-12', '2027-01']) expect(await total(c)).toBe(0);
      expect(await contas()).toEqual([]);
    });

    it('a classificação muda em todas as parcelas, sem mexer em valores', async () => {
      const parcelas = (await lancar({ valor: 90, parcelas: 2 }).expect(201)).body;
      const { body } = await api(app, a.token)
        .patch(`/cartoes/${cartao}/lancamentos/${parcelas[0].id}`, { descricao: 'Licença anual', planoContaId: plano['2.03.05'] })
        .expect(200);
      expect(body.map((l: { descricao: string; planoContaId: string }) => [l.descricao, l.planoContaId])).toEqual([
        ['Licença anual', plano['2.03.05']],
        ['Licença anual', plano['2.03.05']],
      ]);
      await api(app, a.token).patch(`/cartoes/${cartao}/lancamentos/${parcelas[0].id}`, { planoContaId: plano['1.01'] }).expect(400);
    });

    it('a conta da fatura não é editada nem cancelada por contas a pagar', async () => {
      await lancar({}).expect(201);
      const [conta] = await contas();
      const r = await api(app, a.token).patch(`/contas-pagar/${conta.id}`, { valor: 1 }).expect(400);
      expect(r.body.message).toMatch(/fatura de um cartão/);
      await api(app, a.token).post(`/contas-pagar/${conta.id}/cancelamento`).expect(400);
    });
  });

  describe('datas ajustadas', () => {
    it('mover o fechamento leva as compras para a fatura certa e acerta as contas', async () => {
      // Compra em 29/10: pelo padrão (fecha 28/10) cai em dezembro.
      await lancar({ valor: 70, data: '2026-10-29' }).expect(201);
      await lancar({ valor: 30, data: '2026-10-20' }).expect(201);
      expect([await total('2026-11'), await total('2026-12')]).toEqual([30, 70]);

      // O banco fechou em 30/10 (28 caiu no fim de semana) e venceu em 06/11.
      const { body } = await api(app, a.token)
        .patch(`/cartoes/${cartao}/faturas/2026-11`, { dataFechamento: '2026-10-30', dataVencimento: '2026-11-06' })
        .expect(200);
      expect(body).toMatchObject({ dataFechamento: '2026-10-30', dataVencimento: '2026-11-06', datasAjustadas: true, total: 100 });
      expect(await total('2026-12')).toBe(0);
      expect((await fatura('2026-12')).inicioPeriodo).toBe('2026-10-30');
      expect((await contas()).map((c) => [c.dataVencimento, c.valor])).toEqual([['2026-11-06', 100]]);
    });

    it('recusa datas fora de ordem', async () => {
      const ajustar = (dados: object) => api(app, a.token).patch(`/cartoes/${cartao}/faturas/2026-11`, dados);
      await ajustar({ dataVencimento: '2026-10-20' }).expect(400);
      await ajustar({ dataFechamento: '2026-11-28' }).expect(400);
      await ajustar({ dataFechamento: '2026-09-28' }).expect(400);
      await ajustar({ dataVencimento: '2026-12-05' }).expect(400);
      await api(app, a.token).patch(`/cartoes/${cartao}/faturas/2026-13`, {}).expect(400);
    });

    it('mudar os dias do cartão recalcula só as faturas abertas sem ajuste manual', async () => {
      await lancar({ data: '2026-10-10' }).expect(201);
      await lancar({ data: '2026-11-10' }).expect(201);
      await api(app, a.token).patch(`/cartoes/${cartao}/faturas/2026-12`, { dataVencimento: '2026-12-07' }).expect(200);
      await api(app, a.token).patch(`/cartoes/${cartao}`, { diaFechamento: 25, diaVencimento: 2 }).expect(200);
      expect(await fatura('2026-11')).toMatchObject({ dataFechamento: '2026-10-25', dataVencimento: '2026-11-02', datasAjustadas: false });
      expect(await fatura('2026-12')).toMatchObject({ dataFechamento: '2026-11-28', dataVencimento: '2026-12-07', datasAjustadas: true });
    });
  });

  describe('fechamento e pagamento', () => {
    it('fatura fechada não recebe, não perde lançamentos e não muda datas; reabre se não foi paga', async () => {
      const compra = (await lancar({ valor: 100 }).expect(201)).body[0];
      await api(app, a.token).post(`/cartoes/${cartao}/faturas/2026-11/fechamento`).expect(200);
      expect((await fatura('2026-11')).status).toBe('FECHADA');

      expect((await lancar({ data: '2026-10-15' }).expect(400)).body.message).toMatch(/nov\/2026 está fechada/);
      await api(app, a.token).delete(`/cartoes/${cartao}/lancamentos/${compra.id}`).expect(400);
      await api(app, a.token).patch(`/cartoes/${cartao}/faturas/2026-11`, { dataVencimento: '2026-11-06' }).expect(400);
      // A compra de 28/10 iria para dezembro, mas mexer no fechamento de dezembro não pode puxar nada da fechada.
      await lancar({ data: '2026-10-29' }).expect(201);
      await api(app, a.token).patch(`/cartoes/${cartao}/lancamentos/${compra.id}`, { descricao: 'Classificada depois' }).expect(200);

      await api(app, a.token).post(`/cartoes/${cartao}/faturas/2026-11/reabertura`).expect(200);
      await lancar({ data: '2026-10-15', valor: 1 }).expect(201);
      expect(await total('2026-11')).toBe(101);
    });

    it('fatura paga não reabre nem muda; o pagamento libera o limite', async () => {
      await lancar({ valor: 800 }).expect(201);
      await api(app, a.token).post(`/cartoes/${cartao}/faturas/2026-11/fechamento`).expect(200);
      const [conta] = await contas();
      await api(app, a.token).post(`/contas-pagar/${conta.id}/baixas`, { contaBancariaId: banco, data: '2026-11-05' }).expect(201);
      expect((await fatura('2026-11')).pago).toBe(800);
      expect((await api(app, a.token).get(`/cartoes/${cartao}`).expect(200)).body.limiteDisponivel).toBe(5000);
      const r = await api(app, a.token).post(`/cartoes/${cartao}/faturas/2026-11/reabertura`).expect(400);
      expect(r.body.message).toMatch(/pagamento registrado/);
    });

    it('fatura paga antes de fechar não aceita mais compras', async () => {
      await lancar({ valor: 100 }).expect(201);
      const [conta] = await contas();
      await api(app, a.token).post(`/contas-pagar/${conta.id}/baixas`, { contaBancariaId: banco, valor: 50 }).expect(201);
      const r = await lancar({ valor: 10 }).expect(400);
      expect(r.body.message).toMatch(/já tem pagamento registrado/);
      expect(await total('2026-11')).toBe(100);
    });
  });

  describe('DRE', () => {
    it('competência: cada compra na sua categoria e data; a conta da fatura não conta de novo', async () => {
      await lancar({ valor: 300, data: '2026-10-05', planoContaId: plano['2.03.04'] }).expect(201);
      await lancar({ valor: 120, data: '2026-10-06', parcelas: 2, planoContaId: plano['2.03.05'] }).expect(201);
      await lancar({ valor: 50, data: '2026-10-07', tipo: 'ESTORNO', planoContaId: plano['2.03.04'] }).expect(201);
      const { body } = await api(app, a.token).get('/financeiro/dre?de=2026-10-01&ate=2026-12-31').expect(200);
      const valor = (codigo: string) => body.contas.find((c: { codigo: string }) => c.codigo === codigo)?.valor;
      expect([valor('2.03.04'), valor('2.03.05'), body.despesas]).toEqual([250, 120, 370]);
    });

    it('caixa: o pagamento da fatura é dividido entre as categorias das compras', async () => {
      await lancar({ valor: 300, planoContaId: plano['2.03.04'] }).expect(201);
      await lancar({ valor: 100, planoContaId: plano['2.03.05'] }).expect(201);
      const [conta] = await contas();
      await api(app, a.token).post(`/contas-pagar/${conta.id}/baixas`, { contaBancariaId: banco, valor: 200, data: '2026-11-05' }).expect(201);
      const { body } = await api(app, a.token).get('/financeiro/dre?de=2026-11-01&ate=2026-11-30&regime=caixa').expect(200);
      const valor = (codigo: string) => body.contas.find((c: { codigo: string }) => c.codigo === codigo)?.valor;
      expect([valor('2.03.04'), valor('2.03.05'), body.despesas, body.semCategoria.despesas]).toEqual([150, 50, 200, 0]);
    });
  });

  describe('acesso', () => {
    it('consulta lê, vendas não acessa, e outra empresa não vê o cartão', async () => {
      const consulta = await adicionarUsuario(app, a, Perfil.CONSULTA);
      await api(app, consulta.token).get(`/cartoes/${cartao}/faturas/2026-11`).expect(200);
      await lancar({}, consulta.token).expect(403);
      const vendas = await adicionarUsuario(app, a, Perfil.VENDAS);
      await api(app, vendas.token).get('/cartoes').expect(403);
      const b = await registrarEmpresa(app);
      await api(app, b.token).get(`/cartoes/${cartao}`).expect(404);
      await lancar({}, b.token).expect(404);
    });

    it('cartão com lançamentos não é removido', async () => {
      await lancar({}).expect(201);
      await api(app, a.token).delete(`/cartoes/${cartao}`).expect(409);
    });
  });
});

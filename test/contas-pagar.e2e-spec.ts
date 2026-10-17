import { INestApplication } from '@nestjs/common';
import { hoje } from '../src/common/datas';
import { Perfil } from '../src/modules/usuarios/perfil.enum';
import {
  Acesso,
  adicionarUsuario,
  api,
  criarApp,
  criarContaBancaria,
  criarFornecedor,
  limparBanco,
  registrarEmpresa,
} from './helpers';

describe('Contas a pagar', () => {
  let app: INestApplication;
  let a: Acesso;
  let fornecedorId: string;
  /** Contas do plano padrão de A, pelo código. */
  let plano: Record<string, string>;

  beforeAll(async () => {
    app = await criarApp();
  });
  beforeEach(async () => {
    await limparBanco(app);
    a = await registrarEmpresa(app);
    fornecedorId = (await criarFornecedor(app, a.token)).id;
    const { body } = await api(app, a.token).get('/plano-contas').expect(200);
    plano = Object.fromEntries(body.map((c: { codigo: string; id: string }) => [c.codigo, c.id]));
  });
  afterAll(() => app.close());

  const novaConta = (extra: object = {}, token = a.token) =>
    api(app, token).post('/contas-pagar', {
      fornecedorId,
      descricao: 'Aluguel',
      valor: 2500,
      dataVencimento: '2099-01-05',
      ...extra,
    });

  it('cria conta aberta com fornecedor, categoria de despesa e centro de custo', async () => {
    const centro = await api(app, a.token).post('/centros-custo', { nome: 'Matriz' }).expect(201);
    const res = await novaConta({ planoContaId: plano['2.03.01'], centroCustoId: centro.body.id }).expect(201);
    expect(res.body).toMatchObject({
      status: 'ABERTA',
      valor: 2500,
      dataEmissao: hoje(),
      fornecedor: { id: fornecedorId },
      planoConta: { codigo: '2.03.01', nome: 'Aluguel e condomínio' },
      centroCusto: { nome: 'Matriz' },
      baixas: [],
      saldo: 2500,
    });
  });

  it('a categoria é opcional e pode ser definida depois', async () => {
    const { body } = await novaConta().expect(201);
    expect(body.planoContaId).toBeNull();
    const res = await api(app, a.token).patch(`/contas-pagar/${body.id}`, { planoContaId: plano['2.06.01'] }).expect(200);
    expect(res.body.planoConta.codigo).toBe('2.06.01');
  });

  it('recusa categoria de receita, sintética ou inativa', async () => {
    await novaConta({ planoContaId: plano['1.01'] }).expect(400);
    await novaConta({ planoContaId: plano['2.03'] }).expect(400);
    await api(app, a.token).patch(`/plano-contas/${plano['2.03.04']}`, { ativo: false }).expect(200);
    await novaConta({ planoContaId: plano['2.03.04'] }).expect(400);
  });

  it('não aceita vencimento antes da emissão', async () => {
    await novaConta({ dataEmissao: '2099-02-01', dataVencimento: '2099-01-31' }).expect(400);
  });

  it('filtra por fornecedor, categoria, status e período de vencimento', async () => {
    const outro = await criarFornecedor(app, a.token);
    const aluguel = await novaConta({ planoContaId: plano['2.03.01'] }).expect(201);
    await novaConta({ fornecedorId: outro.id, dataVencimento: '2099-03-01' }).expect(201);

    const ids = async (query: string) =>
      (await api(app, a.token).get(`/contas-pagar?${query}`).expect(200)).body.map((c: { id: string }) => c.id);

    expect(await ids(`fornecedorId=${fornecedorId}`)).toEqual([aluguel.body.id]);
    expect(await ids(`planoContaId=${plano['2.03.01']}`)).toEqual([aluguel.body.id]);
    expect(await ids('vencimentoAte=2099-01-31')).toEqual([aluguel.body.id]);
    expect(await ids('status=ABERTA')).toHaveLength(2);
  });

  describe('baixa', () => {
    it('exige a conta bancária de saída e registra o pagamento', async () => {
      const { body } = await novaConta().expect(201);
      const caixa = await criarContaBancaria(app, a.token);

      await api(app, a.token).post(`/contas-pagar/${body.id}/baixas`).expect(400);
      const res = await api(app, a.token)
        .post(`/contas-pagar/${body.id}/baixas`, { contaBancariaId: caixa.id, multa: 50, juros: 0.3 })
        .expect(201);
      expect(res.body).toMatchObject({ status: 'PAGA', saldo: 0 });
      expect(res.body.baixas[0]).toMatchObject({
        valor: 2500,
        valorTotal: 2550.3,
        data: hoje(),
        contaBancaria: { id: caixa.id },
      });
    });

    it('recusa conta bancária inativa', async () => {
      const { body } = await novaConta().expect(201);
      const caixa = await criarContaBancaria(app, a.token);
      await api(app, a.token).patch(`/contas-bancarias/${caixa.id}`, { ativo: false }).expect(200);
      await api(app, a.token).post(`/contas-pagar/${body.id}/baixas`, { contaBancariaId: caixa.id }).expect(400);
    });

    it('paga ou cancelada: sem nova baixa, e só a classificação pode mudar', async () => {
      const { body } = await novaConta().expect(201);
      const caixa = await criarContaBancaria(app, a.token);
      const rota = `/contas-pagar/${body.id}`;
      await api(app, a.token).post(`${rota}/baixas`, { contaBancariaId: caixa.id }).expect(201);

      await api(app, a.token).post(`${rota}/baixas`, { contaBancariaId: caixa.id }).expect(400);
      await api(app, a.token).post(`${rota}/cancelamento`).expect(400);
      await api(app, a.token).patch(rota, { valor: 1 }).expect(400);
      await api(app, a.token).patch(rota, { planoContaId: plano['2.03.01'] }).expect(200);

      const cancelada = await novaConta().expect(201);
      await api(app, a.token).post(`/contas-pagar/${cancelada.body.id}/cancelamento`).expect(201);
      await api(app, a.token).post(`/contas-pagar/${cancelada.body.id}/baixas`, { contaBancariaId: caixa.id }).expect(400);
    });
  });

  describe('integridade', () => {
    it('fornecedor, categoria e conta bancária em uso não podem ser removidos', async () => {
      const { body } = await novaConta({ planoContaId: plano['2.03.01'] }).expect(201);
      const caixa = await criarContaBancaria(app, a.token);
      await api(app, a.token).post(`/contas-pagar/${body.id}/baixas`, { contaBancariaId: caixa.id }).expect(201);

      await api(app, a.token).delete(`/fornecedores/${fornecedorId}`).expect(409);
      await api(app, a.token).delete(`/plano-contas/${plano['2.03.01']}`).expect(409);
      await api(app, a.token).delete(`/contas-bancarias/${caixa.id}`).expect(409);
    });
  });

  describe('isolamento entre empresas', () => {
    let b: Acesso;
    let contaA: string;

    beforeEach(async () => {
      b = await registrarEmpresa(app);
      contaA = (await novaConta().expect(201)).body.id;
    });

    it('outra empresa não lista, consulta, altera, baixa nem cancela', async () => {
      const caixaB = await criarContaBancaria(app, b.token);
      await api(app, b.token).get('/contas-pagar').expect(200, []);
      await api(app, b.token).get(`/contas-pagar?fornecedorId=${fornecedorId}`).expect(200, []);
      await api(app, b.token).get(`/contas-pagar/${contaA}`).expect(404);
      await api(app, b.token).patch(`/contas-pagar/${contaA}`, { descricao: 'Invadida' }).expect(404);
      await api(app, b.token).post(`/contas-pagar/${contaA}/baixas`, { contaBancariaId: caixaB.id }).expect(404);
      await api(app, b.token).post(`/contas-pagar/${contaA}/cancelamento`).expect(404);

      const res = await api(app, a.token).get(`/contas-pagar/${contaA}`).expect(200);
      expect(res.body).toMatchObject({ status: 'ABERTA', descricao: 'Aluguel' });
    });

    it('não usa fornecedor, categoria nem conta bancária de outra empresa', async () => {
      const fornecedorB = await criarFornecedor(app, b.token);
      const caixaB = await criarContaBancaria(app, b.token);
      const planoB = (await api(app, b.token).get('/plano-contas').expect(200)).body;
      const aluguelB = planoB.find((c: { codigo: string }) => c.codigo === '2.03.01').id;

      await novaConta({ fornecedorId: fornecedorB.id }).expect(404);
      await novaConta({ planoContaId: aluguelB }).expect(404);
      await api(app, a.token).post(`/contas-pagar/${contaA}/baixas`, { contaBancariaId: caixaB.id }).expect(404);
    });
  });

  describe('permissões', () => {
    it.each([
      [Perfil.CONSULTA, 200, 403],
      [Perfil.VENDAS, 200, 403],
      [Perfil.FINANCEIRO, 200, 201],
    ])('perfil %s: lista %i, cria e baixa %i', async (perfil, leitura, escrita) => {
      const usuario = await adicionarUsuario(app, a, perfil);
      const { body } = await novaConta().expect(201);
      const caixa = await criarContaBancaria(app, a.token);

      await api(app, usuario.token).get('/contas-pagar').expect(leitura);
      await novaConta({}, usuario.token).expect(escrita);
      await api(app, usuario.token).post(`/contas-pagar/${body.id}/baixas`, { contaBancariaId: caixa.id }).expect(escrita);
    });
  });
});

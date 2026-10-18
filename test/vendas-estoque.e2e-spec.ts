import { INestApplication } from '@nestjs/common';
import { Perfil } from '../src/modules/usuarios/perfil.enum';
import {
  Acesso,
  adicionarUsuario,
  api,
  criarApp,
  criarCliente,
  criarContaBancaria,
  criarFornecedor,
  limparBanco,
  registrarEmpresa,
} from './helpers';

describe('Vendas, compras e estoque', () => {
  let app: INestApplication;
  let a: Acesso;
  let clienteId: string;
  let fornecedorId: string;
  let plano: Record<string, string>;

  beforeAll(async () => {
    app = await criarApp();
  });
  beforeEach(async () => {
    await limparBanco(app);
    a = await registrarEmpresa(app);
    clienteId = (await criarCliente(app, a.token)).id;
    fornecedorId = (await criarFornecedor(app, a.token)).id;
    const { body } = await api(app, a.token).get('/plano-contas').expect(200);
    plano = Object.fromEntries(body.map((c: { codigo: string; id: string }) => [c.codigo, c.id]));
  });
  afterAll(() => app.close());

  let codigo = 0;
  const produto = (dados: object = {}, token = a.token) =>
    api(app, token)
      .post('/produtos', { codigo: `P${++codigo}`, descricao: `Produto ${codigo}`, tipo: 'PRODUTO', unidade: 'UN', precoVenda: 10, ...dados })
      .expect(201)
      .then((r) => r.body as { id: string });
  const ajustar = (produtoId: string, tipo: 'ENTRADA' | 'SAIDA', quantidade: number, dados: object = {}) =>
    api(app, a.token).post('/estoque/ajustes', { produtoId, tipo, quantidade, motivo: 'Inventário', ...dados });
  const posicao = async (produtoId: string, token = a.token) => {
    const { body } = await api(app, token).get('/estoque').expect(200);
    return body.itens.find((i: { produto: { id: string } }) => i.produto.id === produtoId);
  };
  const vender = (itens: object[], dados: object = {}, token = a.token) =>
    api(app, token).post('/vendas', { clienteId, itens, ...dados });
  const comprar = (itens: object[], dados: object = {}) => api(app, a.token).post('/compras', { fornecedorId, itens, ...dados });
  const acao = (rota: string, token = a.token, corpo: object = {}) => api(app, token).post(rota, corpo);

  describe('ajustes e custo médio', () => {
    it('entradas recalculam o custo médio ponderado', async () => {
      const p = await produto();
      await ajustar(p.id, 'ENTRADA', 10, { custoUnitario: 5 }).expect(201);
      const { body } = await ajustar(p.id, 'ENTRADA', 30, { custoUnitario: 7 }).expect(201);
      expect(body).toMatchObject({ produto: { estoque: 40, custo: 6.5 }, avisos: [] });
      expect(await posicao(p.id)).toMatchObject({ estoque: 40, reservado: 0, disponivel: 40, custoMedio: 6.5, valorEstoque: 260 });
    });

    it('saída além do saldo é aceita com aviso e deixa o estoque negativo', async () => {
      const p = await produto({ descricao: 'Farinha' });
      await ajustar(p.id, 'ENTRADA', 2).expect(201);
      const { body } = await ajustar(p.id, 'SAIDA', 3.5).expect(201);
      expect(body.produto.estoque).toBe(-1.5);
      expect(body.avisos).toEqual([expect.stringContaining('Farinha: o estoque ficou negativo (-1,5 UN)')]);
      expect((await posicao(p.id)).valorEstoque).toBe(0);
    });

    it('o kardex mostra cada movimentação com o saldo após ela', async () => {
      const p = await produto();
      await ajustar(p.id, 'ENTRADA', 5, { custoUnitario: 2 }).expect(201);
      await ajustar(p.id, 'SAIDA', 1.25, { motivo: 'Quebra' }).expect(201);
      const { body } = await api(app, a.token).get(`/estoque/movimentacoes?produtoId=${p.id}`).expect(200);
      expect(body.map((m: { tipo: string; quantidade: number; saldo: number; descricao: string }) => [m.tipo, m.quantidade, m.saldo, m.descricao])).toEqual([
        ['ENTRADA', 5, 5, 'Inventário'],
        ['SAIDA', 1.25, 3.75, 'Quebra'],
      ]);
    });

    it('serviço não controla estoque', async () => {
      const s = await produto({ tipo: 'SERVICO', unidade: 'H' });
      await ajustar(s.id, 'ENTRADA', 1).expect(400);
    });

    it('produto que já movimentou estoque não vira serviço', async () => {
      const p = await produto();
      await ajustar(p.id, 'ENTRADA', 1).expect(201);
      const res = await api(app, a.token).patch(`/produtos/${p.id}`, { tipo: 'SERVICO' }).expect(400);
      expect(res.body.message).toMatch(/não pode virar serviço/);
    });

    it('vendas consulta o estoque, mas não ajusta', async () => {
      const vendas = await adicionarUsuario(app, a, Perfil.VENDAS);
      const p = await produto();
      await api(app, vendas.token).get('/estoque').expect(200);
      await api(app, vendas.token).post('/estoque/ajustes', { produtoId: p.id, tipo: 'ENTRADA', quantidade: 1, motivo: 'x' }).expect(403);
    });
  });

  describe('ciclo da venda', () => {
    it('orçamento não reserva; pedido reserva; faturamento baixa o estoque e gera as parcelas', async () => {
      const p = await produto({ precoVenda: 25 });
      await ajustar(p.id, 'ENTRADA', 20, { custoUnitario: 8 }).expect(201);

      const orcamento = (
        await vender([{ produtoId: p.id, quantidade: 12 }], {
          parcelas: 3,
          primeiroVencimento: '2099-01-10',
          planoContaId: plano['1.01'],
          dataEmissao: '2026-10-01',
        }).expect(201)
      ).body;
      expect(orcamento).toMatchObject({ numero: 1, status: 'ORCAMENTO', total: 300, contas: [] });
      expect(orcamento.itens[0]).toMatchObject({ precoUnitario: 25, quantidade: 12, total: 300, descricao: expect.any(String) });
      expect(await posicao(p.id)).toMatchObject({ estoque: 20, reservado: 0, disponivel: 20 });

      await acao(`/vendas/${orcamento.id}/aprovacao`).expect(200);
      expect(await posicao(p.id)).toMatchObject({ estoque: 20, reservado: 12, disponivel: 8 });

      const faturada = (await acao(`/vendas/${orcamento.id}/faturamento`, a.token, { data: '2026-10-05' }).expect(200)).body;
      expect(faturada).toMatchObject({ status: 'FATURADA', dataFaturamento: '2026-10-05', avisos: [] });
      expect(faturada.contas.map((c: { valor: number; dataVencimento: string; descricao: string }) => [c.valor, c.dataVencimento, c.descricao])).toEqual([
        [100, '2099-01-10', 'Venda nº 1 (1/3)'],
        [100, '2099-02-10', 'Venda nº 1 (2/3)'],
        [100, '2099-03-10', 'Venda nº 1 (3/3)'],
      ]);
      expect(faturada.contas[0]).toMatchObject({ clienteId, vendaId: orcamento.id, planoContaId: plano['1.01'], dataEmissao: '2026-10-05' });
      expect(await posicao(p.id)).toMatchObject({ estoque: 8, reservado: 0, disponivel: 8 });

      const { body: kardex } = await api(app, a.token).get(`/estoque/movimentacoes?vendaId=${orcamento.id}`).expect(200);
      expect(kardex).toEqual([expect.objectContaining({ tipo: 'SAIDA', origem: 'VENDA', quantidade: 12, custoUnitario: 8, saldo: 8, data: '2026-10-05' })]);
    });

    it('sem vencimento informado, a venda é à vista no dia do faturamento', async () => {
      const p = await produto();
      const venda = (await vender([{ produtoId: p.id, quantidade: 1 }], { status: 'PEDIDO', dataEmissao: '2026-10-01' }).expect(201)).body;
      const { body } = await acao(`/vendas/${venda.id}/faturamento`, a.token, { data: '2026-10-05' }).expect(200);
      expect(body.contas).toEqual([expect.objectContaining({ valor: 10, dataVencimento: '2026-10-05', descricao: 'Venda nº 1', parcela: null })]);
    });

    it('calcula itens com quantidade fracionada, preço próprio e desconto', async () => {
      const p = await produto({ precoVenda: 18.9 });
      const s = await produto({ tipo: 'SERVICO', unidade: 'H', precoVenda: 100 });
      const { body } = await vender([
        { produtoId: p.id, quantidade: 1.5 },
        { produtoId: s.id, quantidade: 2, precoUnitario: 80, desconto: 10.5 },
      ]).expect(201);
      expect(body.itens.map((i: { total: number }) => i.total)).toEqual([28.35, 149.5]);
      expect(body.total).toBe(177.85);
    });

    it('serviços não mexem no estoque ao faturar', async () => {
      const s = await produto({ tipo: 'SERVICO', unidade: 'H' });
      const venda = (await vender([{ produtoId: s.id, quantidade: 3 }], { status: 'PEDIDO' }).expect(201)).body;
      await acao(`/vendas/${venda.id}/faturamento`).expect(200);
      const { body } = await api(app, a.token).get(`/estoque/movimentacoes?vendaId=${venda.id}`).expect(200);
      expect(body).toEqual([]);
    });

    it('fatura sem saldo suficiente, com aviso', async () => {
      const p = await produto({ descricao: 'Pão francês', unidade: 'KG' });
      await ajustar(p.id, 'ENTRADA', 1).expect(201);
      const venda = (await vender([{ produtoId: p.id, quantidade: 3 }], { status: 'PEDIDO' }).expect(201)).body;
      const { body } = await acao(`/vendas/${venda.id}/faturamento`).expect(200);
      expect(body.avisos).toEqual(['Pão francês: o estoque ficou negativo (-2 KG)']);
      expect((await posicao(p.id)).estoque).toBe(-2);
    });

    it('não fatura antes da emissão nem com vencimento antes do faturamento', async () => {
      const p = await produto();
      const venda = (
        await vender([{ produtoId: p.id, quantidade: 1 }], { status: 'PEDIDO', dataEmissao: '2026-10-10', primeiroVencimento: '2026-10-12' }).expect(201)
      ).body;
      await acao(`/vendas/${venda.id}/faturamento`, a.token, { data: '2026-10-09' }).expect(400);
      const res = await acao(`/vendas/${venda.id}/faturamento`, a.token, { data: '2026-10-13' }).expect(400);
      expect(res.body.message).toMatch(/primeiro vencimento/);
      await acao(`/vendas/${venda.id}/faturamento`, a.token, { data: '2026-10-12' }).expect(200);
    });

    it('respeita a ordem do ciclo', async () => {
      const p = await produto();
      const venda = (await vender([{ produtoId: p.id, quantidade: 1 }]).expect(201)).body;
      const r1 = await acao(`/vendas/${venda.id}/faturamento`).expect(400);
      expect(r1.body.message).toMatch(/ainda é orçamento/);
      await acao(`/vendas/${venda.id}/aprovacao`).expect(200);
      await acao(`/vendas/${venda.id}/aprovacao`).expect(400);
      await api(app, a.token).patch(`/vendas/${venda.id}`, { itens: [{ produtoId: p.id, quantidade: 4 }] }).expect(200);
      await acao(`/vendas/${venda.id}/faturamento`).expect(200);
      await acao(`/vendas/${venda.id}/faturamento`).expect(400);
      await api(app, a.token).patch(`/vendas/${venda.id}`, { observacoes: 'x' }).expect(400);
    });

    it('a alteração dos itens recalcula o total e substitui os anteriores', async () => {
      const p1 = await produto({ precoVenda: 10 });
      const p2 = await produto({ precoVenda: 3 });
      const venda = (await vender([{ produtoId: p1.id, quantidade: 1 }]).expect(201)).body;
      const { body } = await api(app, a.token)
        .patch(`/vendas/${venda.id}`, { itens: [{ produtoId: p2.id, quantidade: 2 }, { produtoId: p1.id, quantidade: 1 }] })
        .expect(200);
      expect(body.itens.map((i: { produtoId: string; ordem: number }) => [i.produtoId, i.ordem])).toEqual([
        [p2.id, 1],
        [p1.id, 2],
      ]);
      expect(body.total).toBe(16);
    });

    it('recusa desconto maior que o item, produto inativo e cliente inativo', async () => {
      const p = await produto({ precoVenda: 10 });
      await vender([{ produtoId: p.id, quantidade: 1, desconto: 10.01 }]).expect(400);
      const inativo = await produto({ ativo: false });
      await vender([{ produtoId: inativo.id, quantidade: 1 }]).expect(400);
      await api(app, a.token).patch(`/clientes/${clienteId}`, { ativo: false }).expect(200);
      await vender([{ produtoId: p.id, quantidade: 1 }]).expect(400);
    });

    it('recusa categoria de despesa', async () => {
      const p = await produto();
      await vender([{ produtoId: p.id, quantidade: 1 }], { planoContaId: plano['2.03.01'] }).expect(400);
    });

    it('numera em sequência por empresa, mesmo com pedidos simultâneos', async () => {
      const p = await produto();
      const respostas = await Promise.all(Array.from({ length: 6 }, () => vender([{ produtoId: p.id, quantidade: 1 }]).expect(201)));
      expect(respostas.map((r) => r.body.numero).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6]);

      const b = await registrarEmpresa(app);
      const clienteB = await criarCliente(app, b.token);
      const pb = await produto({}, b.token);
      const { body } = await api(app, b.token).post('/vendas', { clienteId: clienteB.id, itens: [{ produtoId: pb.id, quantidade: 1 }] }).expect(201);
      expect(body.numero).toBe(1);
    });

    it('dois faturamentos simultâneos da mesma venda: só um passa', async () => {
      const p = await produto();
      await ajustar(p.id, 'ENTRADA', 10).expect(201);
      const venda = (await vender([{ produtoId: p.id, quantidade: 4 }], { status: 'PEDIDO' }).expect(201)).body;
      const status = (await Promise.all([1, 2, 3].map(() => acao(`/vendas/${venda.id}/faturamento`)))).map((r) => r.status).sort();
      expect(status).toEqual([200, 400, 400]);
      expect((await posicao(p.id)).estoque).toBe(6);
      expect((await api(app, a.token).get(`/vendas/${venda.id}`).expect(200)).body.contas).toHaveLength(1);
    });

    it('vendas simultâneas do mesmo produto não perdem baixas de estoque', async () => {
      const p = await produto();
      await ajustar(p.id, 'ENTRADA', 100).expect(201);
      const vendas = await Promise.all(
        Array.from({ length: 5 }, () => vender([{ produtoId: p.id, quantidade: 3 }], { status: 'PEDIDO' }).expect(201)),
      );
      await Promise.all(vendas.map((v) => acao(`/vendas/${v.body.id}/faturamento`).expect(200)));
      expect((await posicao(p.id)).estoque).toBe(85);
    });
  });

  describe('cancelamento da venda', () => {
    const faturar = async (quantidade = 5) => {
      const p = await produto({ precoVenda: 20 });
      await ajustar(p.id, 'ENTRADA', 10, { custoUnitario: 4 }).expect(201);
      const venda = (await vender([{ produtoId: p.id, quantidade }], { status: 'PEDIDO', parcelas: 2, primeiroVencimento: '2099-01-10' }).expect(201)).body;
      return { p, venda: (await acao(`/vendas/${venda.id}/faturamento`).expect(200)).body };
    };

    it('devolve o estoque e cancela as contas a receber', async () => {
      const { p, venda } = await faturar();
      const { body } = await acao(`/vendas/${venda.id}/cancelamento`).expect(200);
      expect(body.status).toBe('CANCELADA');
      expect(body.contas.map((c: { status: string }) => c.status)).toEqual(['CANCELADA', 'CANCELADA']);
      expect(await posicao(p.id)).toMatchObject({ estoque: 10, custoMedio: 4 });
      const { body: kardex } = await api(app, a.token).get(`/estoque/movimentacoes?vendaId=${venda.id}`).expect(200);
      expect(kardex.map((m: { origem: string; tipo: string }) => `${m.origem} ${m.tipo}`)).toEqual(['VENDA SAIDA', 'ESTORNO_VENDA ENTRADA']);
    });

    it('recusa se alguma parcela já foi recebida, sem mexer em nada', async () => {
      const { p, venda } = await faturar();
      const banco = await criarContaBancaria(app, a.token);
      await api(app, a.token).post(`/contas-receber/${venda.contas[0].id}/baixas`, { contaBancariaId: banco.id, valor: 10 }).expect(201);

      const res = await acao(`/vendas/${venda.id}/cancelamento`).expect(400);
      expect(res.body.message).toMatch(/Venda nº 1 \(1\/2\)" já tem pagamento registrado/);
      const depois = (await api(app, a.token).get(`/vendas/${venda.id}`).expect(200)).body;
      expect(depois.status).toBe('FATURADA');
      expect(depois.contas.map((c: { status: string }) => c.status)).toEqual(['PARCIAL', 'ABERTA']);
      expect((await posicao(p.id)).estoque).toBe(5);
    });

    it('vendas fatura e cancela orçamentos, mas não cancela venda faturada', async () => {
      const vendedor = await adicionarUsuario(app, a, Perfil.VENDAS);
      const p = await produto();
      const orcamento = (await vender([{ produtoId: p.id, quantidade: 1 }], {}, vendedor.token).expect(201)).body;
      await acao(`/vendas/${orcamento.id}/cancelamento`, vendedor.token).expect(200);

      const pedido = (await vender([{ produtoId: p.id, quantidade: 1 }], { status: 'PEDIDO' }, vendedor.token).expect(201)).body;
      await acao(`/vendas/${pedido.id}/faturamento`, vendedor.token).expect(200);
      await acao(`/vendas/${pedido.id}/cancelamento`, vendedor.token).expect(403);
      await acao(`/vendas/${pedido.id}/cancelamento`).expect(200);
    });

    it('consulta só lê vendas', async () => {
      const consulta = await adicionarUsuario(app, a, Perfil.CONSULTA);
      const p = await produto();
      await api(app, consulta.token).get('/vendas').expect(200);
      await vender([{ produtoId: p.id, quantidade: 1 }], {}, consulta.token).expect(403);
    });
  });

  describe('compras', () => {
    it('o recebimento dá entrada no estoque com custo médio e gera as contas a pagar', async () => {
      const p = await produto();
      await ajustar(p.id, 'ENTRADA', 10, { custoUnitario: 5 }).expect(201);
      const compra = (
        await comprar([{ produtoId: p.id, quantidade: 30, custoUnitario: 7 }], {
          parcelas: 2,
          primeiroVencimento: '2099-01-15',
          planoContaId: plano['2.01.01'],
          dataEmissao: '2026-10-01',
        }).expect(201)
      ).body;
      expect(compra).toMatchObject({ numero: 1, status: 'PEDIDO', total: 210 });
      expect((await posicao(p.id)).estoque).toBe(10);

      const { body } = await acao(`/compras/${compra.id}/recebimento`, a.token, { data: '2026-10-08' }).expect(200);
      expect(body).toMatchObject({ status: 'RECEBIDA', dataRecebimento: '2026-10-08' });
      expect(body.contas.map((c: { valor: number; dataVencimento: string; fornecedorId: string }) => [c.valor, c.dataVencimento, c.fornecedorId])).toEqual([
        [105, '2099-01-15', fornecedorId],
        [105, '2099-02-15', fornecedorId],
      ]);
      expect(await posicao(p.id)).toMatchObject({ estoque: 40, custoMedio: 6.5 });
    });

    it('cancelar uma compra recebida retira o estoque e devolve o custo médio anterior', async () => {
      const p = await produto();
      await ajustar(p.id, 'ENTRADA', 10, { custoUnitario: 5 }).expect(201);
      const compra = (await comprar([{ produtoId: p.id, quantidade: 30, custoUnitario: 7 }]).expect(201)).body;
      await acao(`/compras/${compra.id}/recebimento`).expect(200);

      const { body } = await acao(`/compras/${compra.id}/cancelamento`).expect(200);
      expect(body.status).toBe('CANCELADA');
      expect(body.contas.map((c: { status: string }) => c.status)).toEqual(['CANCELADA']);
      expect(await posicao(p.id)).toMatchObject({ estoque: 10, custoMedio: 5 });
    });

    it('recusa cancelar compra com parcela paga', async () => {
      const p = await produto();
      const compra = (await comprar([{ produtoId: p.id, quantidade: 1, custoUnitario: 50 }]).expect(201)).body;
      const recebida = (await acao(`/compras/${compra.id}/recebimento`).expect(200)).body;
      const banco = await criarContaBancaria(app, a.token);
      await api(app, a.token).post(`/contas-pagar/${recebida.contas[0].id}/baixas`, { contaBancariaId: banco.id }).expect(201);
      await acao(`/compras/${compra.id}/cancelamento`).expect(400);
      expect((await posicao(p.id)).estoque).toBe(1);
    });

    it('não compra serviço para estoque nem recebe duas vezes', async () => {
      const s = await produto({ tipo: 'SERVICO', unidade: 'H' });
      const res = await comprar([{ produtoId: s.id, quantidade: 1, custoUnitario: 1 }]).expect(400);
      expect(res.body.message).toMatch(/é um serviço/);
      const p = await produto();
      const compra = (await comprar([{ produtoId: p.id, quantidade: 1, custoUnitario: 1 }]).expect(201)).body;
      await acao(`/compras/${compra.id}/recebimento`).expect(200);
      await acao(`/compras/${compra.id}/recebimento`).expect(400);
    });

    it('vendas não acessa compras', async () => {
      const vendedor = await adicionarUsuario(app, a, Perfil.VENDAS);
      await api(app, vendedor.token).get('/compras').expect(403);
    });
  });

  describe('isolamento entre empresas', () => {
    it('não enxerga nem fatura a venda de outra empresa, nem usa o produto dela', async () => {
      const p = await produto();
      const venda = (await vender([{ produtoId: p.id, quantidade: 1 }], { status: 'PEDIDO' }).expect(201)).body;

      const b = await registrarEmpresa(app);
      const clienteB = await criarCliente(app, b.token);
      await api(app, b.token).get(`/vendas/${venda.id}`).expect(404);
      await acao(`/vendas/${venda.id}/faturamento`, b.token).expect(404);
      await api(app, b.token).post('/vendas', { clienteId: clienteB.id, itens: [{ produtoId: p.id, quantidade: 1 }] }).expect(400);
      await api(app, b.token).post('/estoque/ajustes', { produtoId: p.id, tipo: 'ENTRADA', quantidade: 1, motivo: 'x' }).expect(400);
      expect((await api(app, b.token).get('/estoque').expect(200)).body.itens).toEqual([]);
    });
  });
});

import { INestApplication } from '@nestjs/common';
import { hoje } from '../src/common/datas';
import { Perfil } from '../src/modules/usuarios/perfil.enum';
import { Acesso, adicionarUsuario, api, criarApp, criarCliente, criarFornecedor, limparBanco, registrarEmpresa } from './helpers';

/** A projeção começa hoje, então os testes trabalham com datas relativas ao relógio. */
const dias = (n: number) => {
  const d = new Date(`${hoje()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe('Projeção do caixa', () => {
  let app: INestApplication;
  let a: Acesso;
  let clienteId: string;
  let fornecedorId: string;
  let bancoId: string;

  beforeAll(async () => {
    app = await criarApp();
  });
  beforeEach(async () => {
    await limparBanco(app);
    a = await registrarEmpresa(app);
    clienteId = (await criarCliente(app, a.token)).id;
    fornecedorId = (await criarFornecedor(app, a.token)).id;
    bancoId = (await api(app, a.token).post('/contas-bancarias', { nome: 'Caixa', tipo: 'CAIXA', saldoInicial: 1000, dataSaldoInicial: dias(-30) }).expect(201)).body.id;
  });
  afterAll(() => app.close());

  const receber = (valor: number, vencimento: string, descricao = 'Venda') =>
    api(app, a.token).post('/contas-receber', { clienteId, descricao, valor, dataVencimento: vencimento, dataEmissao: dias(-40) }).expect(201).then((r) => r.body);
  const pagar = (valor: number, vencimento: string, descricao = 'Despesa') =>
    api(app, a.token).post('/contas-pagar', { fornecedorId, descricao, valor, dataVencimento: vencimento, dataEmissao: dias(-40) }).expect(201).then((r) => r.body);
  const projecao = async (ate = dias(60), token = a.token) => (await api(app, token).get(`/financeiro/projecao?ate=${ate}`).expect(200)).body;

  it('parte do saldo de hoje e põe cada conta em aberto no dia do vencimento, com as vencidas à parte', async () => {
    await receber(500, dias(10), 'Mensalidade');
    await pagar(800, dias(10), 'Aluguel');
    await pagar(300, dias(20));
    await receber(200, dias(-5), 'Atrasada do cliente');
    await pagar(150, dias(-2), 'Luz vencida');
    // Fora do período, paga, parcial e cancelada.
    await receber(999, dias(90));
    const paga = await pagar(400, dias(15));
    await api(app, a.token).post(`/contas-pagar/${paga.id}/baixas`, { contaBancariaId: bancoId }).expect(201);
    const parcial = await receber(1000, dias(30));
    await api(app, a.token).post(`/contas-receber/${parcial.id}/baixas`, { contaBancariaId: bancoId, valor: 250 }).expect(201);
    const cancelada = await pagar(700, dias(25));
    await api(app, a.token).post(`/contas-pagar/${cancelada.id}/cancelamento`).expect(201);

    const p = await projecao();
    // 1000 de saldo inicial + 250 recebidos - 400 pagos.
    expect(p).toMatchObject({ hoje: hoje(), ate: dias(60), saldoAtual: 850, atrasados: { receber: 200, pagar: 150 } });
    expect(p.atrasados.lancamentosPagar).toEqual([expect.objectContaining({ descricao: 'Luz vencida', valor: 150, vencimento: dias(-2) })]);
    expect(p.dias.map((d: { data: string; receber: number; pagar: number }) => [d.data, d.receber, d.pagar])).toEqual([
      [dias(10), 500, 800],
      [dias(20), 0, 300],
      [dias(30), 750, 0],
    ]);
    // Os lançamentos do dia vêm do maior para o menor, com quem paga ou recebe.
    expect(p.dias[0].lancamentos.map((l: { tipo: string; descricao: string }) => [l.tipo, l.descricao])).toEqual([
      ['PAGAR', 'Aluguel'],
      ['RECEBER', 'Mensalidade'],
    ]);
  });

  it('conta as mensalidades de contratos ainda não faturadas, sem contar em dobro as já faturadas', async () => {
    const servico = (
      await api(app, a.token).post('/produtos', { codigo: 'S1', descricao: 'Suporte', tipo: 'SERVICO', unidade: 'UN', precoVenda: 300 }).expect(201)
    ).body.id;
    const mesAtual = hoje().slice(0, 7);
    const novoContrato = (descricao: string) =>
      api(app, a.token)
        .post('/contratos', { clienteId, descricao, itens: [{ produtoId: servico, quantidade: 1 }], inicio: mesAtual, diaFaturamento: 1, diaVencimento: 28 })
        .expect(201)
        .then((r) => r.body);
    const contrato = await novoContrato('Suporte mensal');
    const pausado = await novoContrato('Pausado');
    await api(app, a.token).post(`/contratos/${pausado.id}/pausa`).expect(200);

    const ate = dias(70);
    const mensalidades = (p: { dias: { lancamentos: { tipo: string; vencimento: string; valor: number }[] }[] }) =>
      p.dias.flatMap((d) => d.lancamentos).filter((l) => l.tipo === 'CONTRATO');
    const antes = mensalidades(await projecao(ate));
    // Uma por mês com vencimento no período (dia 28), só do contrato ativo; a deste mês, se o dia 28 já passou, entra hoje.
    expect(antes.length).toBeGreaterThanOrEqual(2);
    expect(antes.every((l) => l.valor === 300)).toBe(true);
    expect(new Set(antes.map((l) => l.vencimento.slice(0, 7))).size).toBe(antes.length);

    // Faturada a deste mês, ela vira conta a receber (ou vencida, se o dia 28 já passou) e sai das previstas.
    await api(app, a.token).post(`/contratos/${contrato.id}/geracoes`).send({ competencia: mesAtual }).expect(200);
    const depois = await projecao(ate);
    expect(mensalidades(depois).filter((l) => l.vencimento.startsWith(mesAtual))).toHaveLength(0);
    expect(mensalidades(depois)).toHaveLength(antes.length - 1);
    const contasDoMes = [...depois.dias.flatMap((d: { lancamentos: unknown[] }) => d.lancamentos), ...depois.atrasados.lancamentosReceber].filter(
      (l: { tipo: string; vencimento: string }) => l.tipo === 'RECEBER' && l.vencimento === `${mesAtual}-28`,
    );
    expect(contasDoMes).toHaveLength(1);
  });

  it('valida o período, respeita os perfis e isola as empresas', async () => {
    await api(app, a.token).get(`/financeiro/projecao?ate=${hoje()}`).expect(400);
    await api(app, a.token).get(`/financeiro/projecao?ate=${dias(800)}`).expect(400);
    await api(app, a.token).get('/financeiro/projecao').expect(400);
    await pagar(100, dias(5));

    const consulta = await adicionarUsuario(app, a, Perfil.CONSULTA);
    expect((await projecao(dias(30), consulta.token)).dias).toHaveLength(1);
    const vendas = await adicionarUsuario(app, a, Perfil.VENDAS);
    await api(app, vendas.token).get(`/financeiro/projecao?ate=${dias(30)}`).expect(403);

    const b = await registrarEmpresa(app);
    expect(await projecao(dias(30), b.token)).toMatchObject({ saldoAtual: 0, dias: [], atrasados: { receber: 0, pagar: 0 } });
  });
});

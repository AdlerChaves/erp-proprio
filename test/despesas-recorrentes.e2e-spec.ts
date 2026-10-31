import { INestApplication } from '@nestjs/common';
import { hoje } from '../src/common/datas';
import { ajustarDiaUtil, diaUtil, feriadosBancarios, pascoa } from '../src/common/dias-uteis';
import { mesSeguinte } from '../src/modules/contratos/geracao.service';
import { AgendadorDespesas } from '../src/modules/despesas-recorrentes/agendador';
import { AjusteDiaUtil } from '../src/modules/despesas-recorrentes/despesa-recorrente.entity';
import { ocorrencias, vencimentoEm } from '../src/modules/despesas-recorrentes/ocorrencias';
import { Perfil } from '../src/modules/usuarios/perfil.enum';
import { Acesso, adicionarUsuario, api, criarApp, criarCliente, criarFornecedor, limparBanco, registrarEmpresa } from './helpers';

const ATUAL = hoje().slice(0, 7);
const ANTERIOR = mesSeguinte(ATUAL, -1);
const dias = (n: number) => {
  const d = new Date(`${hoje()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe('Calendário bancário', () => {
  it('calcula a Páscoa e os feriados móveis', () => {
    expect(pascoa(2026).toISOString().slice(0, 10)).toBe('2026-04-05');
    expect(pascoa(2027).toISOString().slice(0, 10)).toBe('2027-03-28');
    // Carnaval (segunda e terça), Sexta-feira Santa e Corpus Christi de 2026, e o 20/11 nacional.
    expect([...feriadosBancarios(2026)]).toEqual(expect.arrayContaining(['2026-02-16', '2026-02-17', '2026-04-03', '2026-06-04', '2026-11-20']));
    expect(diaUtil('2026-11-20')).toBe(false);
    expect(diaUtil('2026-11-18')).toBe(true);
  });

  it('leva o vencimento ao dia útil anterior ou seguinte', () => {
    // 15/11/2026 é domingo e feriado; 20/11/2026 é sexta e feriado.
    expect(ajustarDiaUtil('2026-11-15', 'POSTERGAR')).toBe('2026-11-16');
    expect(ajustarDiaUtil('2026-11-20', 'POSTERGAR')).toBe('2026-11-23');
    expect(ajustarDiaUtil('2026-11-20', 'ANTECIPAR')).toBe('2026-11-19');
    expect(ajustarDiaUtil('2026-11-20', 'MANTER')).toBe('2026-11-20');
  });

  it('dia 31 vence no último dia de meses mais curtos; trimestral e anual pulam os meses certos', () => {
    const base = { fim: null, diaVencimento: 31, ajusteDiaUtil: AjusteDiaUtil.MANTER, diasAntecedencia: 10 };
    expect(vencimentoEm({ ...base, inicio: '2027-01', intervaloMeses: 1 }, '2027-02')).toBe('2027-02-28');
    expect(ocorrencias({ ...base, inicio: '2027-01', intervaloMeses: 3 }, '2027-01', '2027-12-31').map((o) => o.competencia)).toEqual([
      '2027-01',
      '2027-04',
      '2027-07',
      '2027-10',
    ]);
    expect(ocorrencias({ ...base, inicio: '2027-03', intervaloMeses: 12, fim: '2029-03' }, '2027-01', '2031-12-31').map((o) => o.competencia)).toEqual([
      '2027-03',
      '2028-03',
      '2029-03',
    ]);
  });
});

describe('Despesas recorrentes', () => {
  let app: INestApplication;
  let a: Acesso;
  let fornecedorId: string;

  beforeAll(async () => {
    app = await criarApp();
  });
  beforeEach(async () => {
    await limparBanco(app);
    a = await registrarEmpresa(app);
    fornecedorId = (await criarFornecedor(app, a.token)).id;
  });
  afterAll(() => app.close());

  const nova = (dados: object = {}, token = a.token) =>
    api(app, token)
      .post('/despesas-recorrentes')
      .send({ fornecedorId, descricao: 'Aluguel', tipoValor: 'FIXO', valor: 3200, diaVencimento: 10, inicio: ATUAL, ...dados });
  const contasDa = async (despesaId: string) =>
    ((await api(app, a.token).get('/contas-pagar').expect(200)).body as { despesaRecorrenteId: string; competenciaRecorrente: string; valor: number; estimada: boolean; status: string; id: string; dataVencimento: string }[])
      .filter((c) => c.despesaRecorrenteId === despesaId)
      .sort((x, y) => x.competenciaRecorrente.localeCompare(y.competenciaRecorrente));

  it('cadastra, valida o tipo de valor e mostra os próximos vencimentos já no dia útil', async () => {
    const msg = async (dados: object) => (await nova(dados).expect(400)).body.message;
    expect(await msg({ valor: undefined })).toMatch(/Informe o valor/);
    expect(await msg({ tipoValor: 'ESTIMADO', valor: undefined })).toMatch(/valor estimado/);
    expect(await msg({ tipoValor: 'PERCENTUAL_FATURAMENTO', valor: undefined })).toMatch(/percentual/);
    expect(await msg({ intervaloMeses: 4 })).toEqual(expect.arrayContaining([expect.stringMatching(/intervaloMeses/)]));
    expect(await msg({ inicio: ATUAL, fim: ANTERIOR })).toMatch(/fim não pode ser antes/);

    const { body } = await nova({ tipoValor: 'PERCENTUAL_FATURAMENTO', valor: 999, percentual: 6 }).expect(201);
    // No percentual, o valor não é guardado.
    expect(body).toMatchObject({ situacao: 'ATIVA', valor: null, percentual: 6, intervaloMeses: 1, ajusteDiaUtil: 'POSTERGAR', diasAntecedencia: 10 });

    const fixa = (await nova({ diaVencimento: 15 }).expect(201)).body;
    expect(fixa.proximas.length).toBeGreaterThanOrEqual(3);
    for (const p of fixa.proximas) {
      expect(diaUtil(p.vencimento)).toBe(true);
      expect(p).toMatchObject({ valor: 3200, estimado: false, base: 'Valor fixo', contaId: null });
    }
  });

  it('o agendador lança a conta quando chega a antecedência, uma vez só; cancelada é mês pulado', async () => {
    // 20 dias de antecedência: mesmo que o dia 10 caia em fim de semana ou feriado, a conta deste mês já está liberada
    // no dia 1º, e a do mês seguinte ainda não.
    const d = (await nova({ diaVencimento: 10, diasAntecedencia: 20 }).expect(201)).body;
    const agendador = app.get(AgendadorDespesas);
    const vencimento = vencimentoEm({ ...d }, ATUAL);
    expect(await agendador.rodar(`${ATUAL}-01`)).toBe(1);
    expect(await agendador.rodar(`${ATUAL}-01`)).toBe(0);
    const [conta] = await contasDa(d.id);
    expect(conta).toMatchObject({ competenciaRecorrente: ATUAL, valor: 3200, estimada: false, dataVencimento: vencimento, status: 'ABERTA' });
    expect((await api(app, a.token).get(`/contas-pagar/${conta.id}`).expect(200)).body.descricao).toBe(`Aluguel - ${ATUAL.slice(5)}/${ATUAL.slice(0, 4)}`);

    await api(app, a.token).post(`/contas-pagar/${conta.id}/cancelamento`).expect(201);
    expect(await agendador.rodar(`${ATUAL}-01`)).toBe(0);
    expect(await contasDa(d.id)).toHaveLength(1);

    // Pausada, não lança; "lançar agora" adianta a próxima.
    await api(app, a.token).post(`/despesas-recorrentes/${d.id}/pausa`).expect(200);
    await api(app, a.token).post(`/despesas-recorrentes/${d.id}/lancamento`).expect(400);
    await api(app, a.token).post(`/despesas-recorrentes/${d.id}/reativacao`).expect(200);
    await api(app, a.token).post(`/despesas-recorrentes/${d.id}/lancamento`).expect(200);
    expect((await contasDa(d.id)).map((c) => c.competenciaRecorrente)).toEqual([ATUAL, mesSeguinte(ATUAL)]);
    expect((await api(app, a.token).delete(`/despesas-recorrentes/${d.id}`).expect(400)).body.message).toMatch(/encerre-a/);
  });

  it('despesa variável: lança com a estimativa e passa a prever pela média das contas reais', async () => {
    const d = (await nova({ descricao: 'Energia elétrica', tipoValor: 'ESTIMADO', valor: 300, diaVencimento: 15, inicio: ANTERIOR }).expect(201)).body;
    const lancar = async () => (await api(app, a.token).post(`/despesas-recorrentes/${d.id}/lancamento`).expect(200)).body;
    await lancar();
    let contas = await contasDa(d.id);
    expect(contas[0]).toMatchObject({ competenciaRecorrente: ANTERIOR, valor: 300, estimada: true });

    // Chegou a conta de verdade: corrigir o valor tira a marca de estimada.
    expect((await api(app, a.token).patch(`/contas-pagar/${contas[0].id}`).send({ valor: 340 }).expect(200)).body.estimada).toBe(false);
    const depois = await lancar();
    expect(depois.proximas.find((p: { contaId: string | null }) => p.contaId === null)).toMatchObject({ valor: 340, estimado: true, base: 'Média das últimas contas' });
    contas = await contasDa(d.id);
    expect(contas[1]).toMatchObject({ competenciaRecorrente: ATUAL, valor: 340, estimada: true });
    await api(app, a.token).patch(`/contas-pagar/${contas[1].id}`).send({ valor: 360 }).expect(200);
    await lancar();
    expect((await contasDa(d.id))[2]).toMatchObject({ valor: 350, estimada: true });
  });

  it('percentual do faturamento: o DAS sai sobre o que foi faturado no mês anterior', async () => {
    const clienteId = (await criarCliente(app, a.token)).id;
    const produtoId = (await api(app, a.token).post('/produtos', { codigo: 'S1', descricao: 'Serviço', tipo: 'SERVICO', unidade: 'UN', precoVenda: 10000 }).expect(201)).body.id;
    const venda = (await api(app, a.token).post('/vendas', { clienteId, status: 'PEDIDO', itens: [{ produtoId, quantidade: 1 }], dataEmissao: `${ANTERIOR}-05` }).expect(201)).body;
    await api(app, a.token).post(`/vendas/${venda.id}/faturamento`).send({ data: `${ANTERIOR}-10` }).expect(200);

    const d = (
      await nova({ descricao: 'DAS - Simples Nacional', tipoValor: 'PERCENTUAL_FATURAMENTO', percentual: 6, diaVencimento: 20, ajusteDiaUtil: 'ANTECIPAR' }).expect(201)
    ).body;
    const desteMes = d.proximas[0];
    expect(desteMes).toMatchObject({ competencia: ATUAL, valor: 600, estimado: true, base: `6% do faturamento de ${ANTERIOR.slice(5)}/${ANTERIOR.slice(0, 4)}` });
    expect(desteMes.vencimento).toBe(vencimentoEm({ ...d }, ATUAL));
    // Nos meses seguintes, o mês de base ainda não fechou: sem faturamento no mês corrente, vale a média dos últimos
    // 3 meses fechados (10.000 / 3).
    expect(d.proximas[1]).toMatchObject({ valor: 200, base: '6% da média de faturamento dos últimos 3 meses' });

    // Faturando no mês corrente mais que a média, o DAS seguinte acompanha o que já foi faturado.
    const outra = (await api(app, a.token).post('/vendas', { clienteId, status: 'PEDIDO', itens: [{ produtoId, quantidade: 2 }], dataEmissao: hoje() }).expect(201)).body;
    await api(app, a.token).post(`/vendas/${outra.id}/faturamento`).send({ data: hoje() }).expect(200);
    const atualizado = (await api(app, a.token).get(`/despesas-recorrentes/${d.id}`).expect(200)).body;
    expect(atualizado.proximas[1]).toMatchObject({ valor: 1200, base: `6% do faturamento de ${ATUAL.slice(5)}/${ATUAL.slice(0, 4)} até agora` });

    await api(app, a.token).post(`/despesas-recorrentes/${d.id}/lancamento`).expect(200);
    expect((await contasDa(d.id))[0]).toMatchObject({ valor: 600, estimada: true });
  });

  it('entra na projeção do caixa enquanto não é lançada, sem contar em dobro depois', async () => {
    const d = (await nova({ valor: 1000, diaVencimento: 25 }).expect(201)).body;
    const ate = dias(70);
    const recorrentes = async () => {
      const p = (await api(app, a.token).get(`/financeiro/projecao?ate=${ate}`).expect(200)).body;
      return p.dias.flatMap((x: { lancamentos: { tipo: string; descricao: string; estimado: boolean }[] }) => x.lancamentos).filter((l: { tipo: string }) => l.tipo === 'RECORRENTE');
    };
    const antes = await recorrentes();
    expect(antes).toHaveLength(ocorrencias(d, ATUAL, ate).length);
    expect(antes[0]).toMatchObject({ descricao: `Aluguel - ${ATUAL.slice(5)}/${ATUAL.slice(0, 4)}`, estimado: false });

    await api(app, a.token).post(`/despesas-recorrentes/${d.id}/lancamento`).expect(200);
    expect(await recorrentes()).toHaveLength(antes.length - 1);
  });

  it('consulta só lê; vendas não acessa; outra empresa não vê', async () => {
    const d = (await nova().expect(201)).body;
    const consulta = await adicionarUsuario(app, a, Perfil.CONSULTA);
    await api(app, consulta.token).get(`/despesas-recorrentes/${d.id}`).expect(200);
    await nova({}, consulta.token).expect(403);
    await api(app, consulta.token).post(`/despesas-recorrentes/${d.id}/lancamento`).expect(403);
    const vendas = await adicionarUsuario(app, a, Perfil.VENDAS);
    await api(app, vendas.token).get('/despesas-recorrentes').expect(403);
    const b = await registrarEmpresa(app);
    await api(app, b.token).get(`/despesas-recorrentes/${d.id}`).expect(404);
    await api(app, b.token).post(`/despesas-recorrentes/${d.id}/lancamento`).expect(404);
  });
});

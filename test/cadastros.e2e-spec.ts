import { INestApplication } from '@nestjs/common';
import { Perfil } from '../src/modules/usuarios/perfil.enum';
import {
  Acesso,
  adicionarUsuario,
  api,
  criarApp,
  criarCliente,
  criarConta,
  limparBanco,
  registrarEmpresa,
} from './helpers';

const hoje = () => new Date().toISOString().slice(0, 10);

describe('Cadastros', () => {
  let app: INestApplication;
  let a: Acesso;
  let b: Acesso;

  beforeAll(async () => {
    app = await criarApp();
  });
  beforeEach(async () => {
    await limparBanco(app);
    a = await registrarEmpresa(app);
    b = await registrarEmpresa(app);
  });
  afterAll(() => app.close());

  let seq = 0;
  const recursos = [
    {
      rota: '/fornecedores',
      criar: () => ({ nome: 'Fornecedor', documento: String(20_000_000_000 + ++seq) }),
      alterar: { nome: 'Alterado' },
      escrita: [Perfil.ADMIN, Perfil.FINANCEIRO],
    },
    {
      rota: '/produtos',
      criar: () => ({ codigo: `P${++seq}`, descricao: 'Produto', tipo: 'PRODUTO', unidade: 'un', precoVenda: 10 }),
      alterar: { descricao: 'Alterado' },
      escrita: [Perfil.ADMIN, Perfil.FINANCEIRO, Perfil.VENDAS],
    },
    {
      rota: '/plano-contas',
      criar: () => ({ codigo: String(++seq), nome: 'Receitas', tipo: 'RECEITA' }),
      alterar: { nome: 'Alterado' },
      escrita: [Perfil.ADMIN, Perfil.FINANCEIRO],
    },
    {
      rota: '/centros-custo',
      criar: () => ({ nome: `Centro ${++seq}` }),
      alterar: { descricao: 'Alterado' },
      escrita: [Perfil.ADMIN, Perfil.FINANCEIRO],
    },
    {
      rota: '/contas-bancarias',
      criar: () => ({ nome: `Conta ${++seq}`, tipo: 'CAIXA', saldoInicial: 0 }),
      alterar: { ativo: false },
      escrita: [Perfil.ADMIN, Perfil.FINANCEIRO],
    },
  ];

  describe.each(recursos)('$rota', (r) => {
    it('cria, lista, consulta, altera e remove', async () => {
      const criado = await api(app, a.token).post(r.rota, r.criar()).expect(201);
      expect(criado.body.empresaId).toBe(a.empresaId);
      const id = criado.body.id;

      const lista = await api(app, a.token).get(r.rota).expect(200);
      expect(lista.body.map((x: { id: string }) => x.id)).toEqual([id]);

      await api(app, a.token).get(`${r.rota}/${id}`).expect(200);
      const alterado = await api(app, a.token).patch(`${r.rota}/${id}`, r.alterar).expect(200);
      expect(alterado.body).toMatchObject(r.alterar);

      await api(app, a.token).delete(`${r.rota}/${id}`).expect(204);
      await api(app, a.token).get(`${r.rota}/${id}`).expect(404);
    });

    it('é isolado entre empresas', async () => {
      const { body } = await api(app, a.token).post(r.rota, r.criar()).expect(201);

      await api(app, b.token).get(r.rota).expect(200, []);
      await api(app, b.token).get(`${r.rota}/${body.id}`).expect(404);
      await api(app, b.token).patch(`${r.rota}/${body.id}`, r.alterar).expect(404);
      await api(app, b.token).delete(`${r.rota}/${body.id}`).expect(404);
      await api(app, a.token).get(`${r.rota}/${body.id}`).expect(200);
    });

    it.each(Object.values(Perfil))('perfil %s: lê; cria e remove conforme a regra', async (perfil) => {
      const usuario = await adicionarUsuario(app, a, perfil);
      const { body } = await api(app, a.token).post(r.rota, r.criar()).expect(201);

      await api(app, usuario.token).get(r.rota).expect(200);
      await api(app, usuario.token).post(r.rota, r.criar()).expect(r.escrita.includes(perfil) ? 201 : 403);
      await api(app, usuario.token).patch(`${r.rota}/${body.id}`, r.alterar).expect(r.escrita.includes(perfil) ? 200 : 403);
      await api(app, usuario.token).delete(`${r.rota}/${body.id}`).expect(perfil === Perfil.ADMIN ? 204 : 403);
    });
  });

  describe('fornecedores', () => {
    it('recusa documento repetido na empresa, mas aceita o de um cliente', async () => {
      const cliente = await criarCliente(app, a.token);
      await api(app, a.token).post('/fornecedores', { nome: 'F', documento: cliente.documento }).expect(201);
      await api(app, a.token).post('/fornecedores', { nome: 'G', documento: cliente.documento }).expect(409);
    });
  });

  describe('produtos', () => {
    const produto = (extra: object = {}) => ({
      codigo: 'SKU-1',
      descricao: 'Parafuso',
      tipo: 'PRODUTO',
      unidade: ' kg ',
      precoVenda: 12.5,
      ...extra,
    });

    it('normaliza a unidade e devolve valores como número', async () => {
      const res = await api(app, a.token).post('/produtos', produto({ custo: 7.25, ncm: '73181500' })).expect(201);
      expect(res.body).toMatchObject({ unidade: 'KG', precoVenda: 12.5, custo: 7.25, ncm: '73181500' });
    });

    it('recusa código repetido na empresa, mas aceita em outra', async () => {
      await api(app, a.token).post('/produtos', produto()).expect(201);
      await api(app, a.token).post('/produtos', produto()).expect(409);
      await api(app, b.token).post('/produtos', produto()).expect(201);
    });

    it('aceita NCM só em produto e código de serviço só em serviço', async () => {
      await api(app, a.token).post('/produtos', produto({ codigoServico: '01.07' })).expect(400);
      await api(app, a.token)
        .post('/produtos', produto({ codigo: 'S-1', tipo: 'SERVICO', unidade: 'H', ncm: '73181500' }))
        .expect(400);
      await api(app, a.token)
        .post('/produtos', produto({ codigo: 'S-1', tipo: 'SERVICO', unidade: 'H', codigoServico: '01.07' }))
        .expect(201);
    });

    it('só vira serviço se o NCM for removido junto', async () => {
      const { body } = await api(app, a.token).post('/produtos', produto({ ncm: '73181500' })).expect(201);
      await api(app, a.token).patch(`/produtos/${body.id}`, { tipo: 'SERVICO' }).expect(400);
      const res = await api(app, a.token).patch(`/produtos/${body.id}`, { tipo: 'SERVICO', ncm: null }).expect(200);
      expect(res.body).toMatchObject({ tipo: 'SERVICO', ncm: null });
    });

    it('filtra por tipo', async () => {
      await api(app, a.token).post('/produtos', produto()).expect(201);
      await api(app, a.token).post('/produtos', produto({ codigo: 'S-1', tipo: 'SERVICO', unidade: 'H' })).expect(201);
      const res = await api(app, a.token).get('/produtos?tipo=SERVICO').expect(200);
      expect(res.body.map((p: { codigo: string }) => p.codigo)).toEqual(['S-1']);
    });

    it('valida preço negativo e formatos fiscais', async () => {
      const res = await api(app, a.token)
        .post('/produtos', produto({ precoVenda: -1, ncm: '123', codigoServico: '1.7' }))
        .expect(400);
      expect(res.body.message).toHaveLength(3);
    });
  });

  describe('plano de contas', () => {
    const criar = (token: string, dados: object) => api(app, token).post('/plano-contas', dados);

    /** Cria a conta sintética "1 Receitas" e devolve o id. */
    const criarGrupoReceitas = async () =>
      (await criar(a.token, { codigo: '1', nome: 'Receitas', tipo: 'RECEITA', aceitaLancamento: false }).expect(201)).body
        .id as string;

    it('monta a árvore e lista em ordem de código', async () => {
      const raiz = await criarGrupoReceitas();
      await criar(a.token, { codigo: '1.02', nome: 'Serviços', tipo: 'RECEITA', contaPaiId: raiz }).expect(201);
      await criar(a.token, { codigo: '1.01', nome: 'Vendas', tipo: 'RECEITA', contaPaiId: raiz }).expect(201);
      await criar(a.token, { codigo: '2', nome: 'Despesas', tipo: 'DESPESA' }).expect(201);

      const todas = await api(app, a.token).get('/plano-contas').expect(200);
      expect(todas.body.map((c: { codigo: string }) => c.codigo)).toEqual(['1', '1.01', '1.02', '2']);
      expect(todas.body[1].contaPaiId).toBe(raiz);

      const despesas = await api(app, a.token).get('/plano-contas?tipo=DESPESA').expect(200);
      expect(despesas.body.map((c: { codigo: string }) => c.codigo)).toEqual(['2']);
    });

    it('não cria subconta embaixo de conta analítica', async () => {
      const { body } = await criar(a.token, { codigo: '1', nome: 'Receitas', tipo: 'RECEITA' }).expect(201);
      await criar(a.token, { codigo: '1.01', nome: 'Vendas', tipo: 'RECEITA', contaPaiId: body.id }).expect(400);
    });

    it('exige o mesmo tipo e o código prefixado pela conta pai', async () => {
      const raiz = await criarGrupoReceitas();
      await criar(a.token, { codigo: '1.01', nome: 'X', tipo: 'DESPESA', contaPaiId: raiz }).expect(400);
      await criar(a.token, { codigo: '2.01', nome: 'X', tipo: 'RECEITA', contaPaiId: raiz }).expect(400);
      await criar(a.token, { codigo: '11', nome: 'X', tipo: 'RECEITA', contaPaiId: raiz }).expect(400);
    });

    it('não aceita conta pai de outra empresa', async () => {
      const raiz = await criarGrupoReceitas();
      await criar(b.token, { codigo: '1.01', nome: 'X', tipo: 'RECEITA', contaPaiId: raiz }).expect(404);
    });

    it('protege contas que têm subcontas', async () => {
      const raiz = await criarGrupoReceitas();
      const filha = await criar(a.token, { codigo: '1.01', nome: 'Vendas', tipo: 'RECEITA', contaPaiId: raiz }).expect(201);

      await api(app, a.token).delete(`/plano-contas/${raiz}`).expect(409);
      await api(app, a.token).patch(`/plano-contas/${raiz}`, { aceitaLancamento: true }).expect(400);
      await api(app, a.token).patch(`/plano-contas/${raiz}`, { codigo: '9' }).expect(400);

      await api(app, a.token).delete(`/plano-contas/${filha.body.id}`).expect(204);
      await api(app, a.token).delete(`/plano-contas/${raiz}`).expect(204);
    });

    it('mantém o prefixo ao mudar o código de uma subconta', async () => {
      const raiz = await criarGrupoReceitas();
      const { body } = await criar(a.token, { codigo: '1.01', nome: 'Vendas', tipo: 'RECEITA', contaPaiId: raiz }).expect(201);
      await api(app, a.token).patch(`/plano-contas/${body.id}`, { codigo: '2.01' }).expect(400);
      await api(app, a.token).patch(`/plano-contas/${body.id}`, { codigo: '1.05' }).expect(200);
    });

    it('não permite mudar tipo nem conta pai depois de criada', async () => {
      const raiz = await criarGrupoReceitas();
      await api(app, a.token).patch(`/plano-contas/${raiz}`, { tipo: 'DESPESA' }).expect(400);
      await api(app, a.token).patch(`/plano-contas/${raiz}`, { contaPaiId: raiz }).expect(400);
    });

    it('recusa código repetido e formato inválido', async () => {
      await criarGrupoReceitas();
      await criar(a.token, { codigo: '1', nome: 'Outra', tipo: 'DESPESA' }).expect(409);
      await criar(a.token, { codigo: '1.a', nome: 'X', tipo: 'DESPESA' }).expect(400);
    });
  });

  describe('centros de custo', () => {
    it('recusa nome repetido na empresa, inclusive ao renomear', async () => {
      await api(app, a.token).post('/centros-custo', { nome: 'Comercial' }).expect(201);
      await api(app, a.token).post('/centros-custo', { nome: 'Comercial' }).expect(409);
      const outro = await api(app, a.token).post('/centros-custo', { nome: 'Fábrica' }).expect(201);
      await api(app, a.token).patch(`/centros-custo/${outro.body.id}`, { nome: 'Comercial' }).expect(409);
      await api(app, b.token).post('/centros-custo', { nome: 'Comercial' }).expect(201);
    });
  });

  describe('contas bancárias', () => {
    const corrente = { nome: 'Itaú', tipo: 'CORRENTE', banco: '341', agencia: '1234', numero: '56789-0', saldoInicial: -150.75 };

    it('cria conta corrente com saldo negativo e data de hoje por padrão', async () => {
      const res = await api(app, a.token).post('/contas-bancarias', corrente).expect(201);
      expect(res.body).toMatchObject({ banco: '341', saldoInicial: -150.75, dataSaldoInicial: hoje() });
    });

    it('exige banco, agência e número exceto para caixa', async () => {
      await api(app, a.token).post('/contas-bancarias', { ...corrente, banco: undefined }).expect(400);
      const caixa = await api(app, a.token)
        .post('/contas-bancarias', { nome: 'Caixa', tipo: 'CAIXA', banco: '341', agencia: '1', numero: '1', saldoInicial: 0 })
        .expect(201);
      expect(caixa.body).toMatchObject({ banco: null, agencia: null, numero: null });
    });

    it('não vira conta corrente sem os dados bancários', async () => {
      const { body } = await api(app, a.token).post('/contas-bancarias', { nome: 'Caixa', tipo: 'CAIXA', saldoInicial: 0 }).expect(201);
      await api(app, a.token).patch(`/contas-bancarias/${body.id}`, { tipo: 'CORRENTE' }).expect(400);
      await api(app, a.token)
        .patch(`/contas-bancarias/${body.id}`, { tipo: 'CORRENTE', banco: '001', agencia: '1', numero: '2' })
        .expect(200);
    });

    it('recusa nome repetido na empresa', async () => {
      await api(app, a.token).post('/contas-bancarias', corrente).expect(201);
      await api(app, a.token).post('/contas-bancarias', corrente).expect(409);
    });
  });

  describe('integridade', () => {
    it('remover cliente com contas a receber responde 409, não 500', async () => {
      const cliente = await criarCliente(app, a.token);
      await criarConta(app, a.token, cliente.id);
      const res = await api(app, a.token).delete(`/clientes/${cliente.id}`).expect(409);
      expect(res.body.message).toMatch(/vinculado/);
    });
  });
});

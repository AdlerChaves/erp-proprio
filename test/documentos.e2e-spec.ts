import { INestApplication } from '@nestjs/common';
import { dadosVenda } from '../src/modules/documentos/dados-documento';
import { gerarPdf, montarDocumento } from '../src/modules/documentos/documento-pdf';
import { Perfil } from '../src/modules/usuarios/perfil.enum';
import { Acesso, adicionarUsuario, api, criarApp, criarFornecedor, limparBanco, registrarEmpresa } from './helpers';

const EMPRESA = {
  razaoSocial: 'Adler Tecnologia Ltda',
  nomeFantasia: 'Adler Tec',
  cnpj: '11222333000181',
  inscricaoMunicipal: '48291',
  codigoMunicipio: '3556503',
  telefone: '1146060000',
  email: 'contato@adlertec.com.br',
  endereco: { cep: '13220000', logradouro: 'Rua Duque de Caxias', numero: '100', bairro: 'Centro', codigoMunicipio: '3556503' },
};

const VENDA = {
  numero: 7,
  dataEmissao: '2026-10-21',
  status: 'ORCAMENTO',
  parcelas: 3,
  primeiroVencimento: '2026-11-10',
  observacoes: 'Entrega em 5 dias úteis.',
  total: 331.25,
  cliente: { nome: 'Mercado Bom Preço', documento: '52998224725', telefone: '11999990000', email: null, endereco: null },
  itens: [
    { descricao: 'Pão francês', quantidade: 12.5, precoUnitario: 18.9, desconto: 0, total: 236.25, produto: { codigo: 'PAO-KG', unidade: 'KG' } },
    { descricao: 'Bolo de chocolate', quantidade: 2, precoUnitario: 45, desconto: 5, total: 85, produto: { codigo: 'BOLO', unidade: 'UN' } },
    { descricao: 'Entrega', quantidade: 1, precoUnitario: 10, desconto: 0, total: 10, produto: { codigo: 'ENT', unidade: 'UN' } },
  ],
  contas: [],
};

describe('Dados do documento em PDF', () => {
  it('orçamento: textos formatados, subtotal, descontos e parcelas previstas', () => {
    const d = dadosVenda(VENDA, EMPRESA, '21/10/2026 14:30');
    expect(d).toMatchObject({
      tipo: 'ORCAMENTO',
      numero: 7,
      emissao: '21/10/2026',
      cancelado: false,
      comDesconto: true,
      subtotal: 'R$ 336,25',
      descontos: 'R$ 5,00',
      total: 'R$ 331,25',
      observacoes: 'Entrega em 5 dias úteis.',
    });
    expect(d.empresa).toEqual({
      nome: 'Adler Tec',
      razaoSocial: 'Adler Tecnologia Ltda',
      documento: 'CNPJ 11.222.333/0001-81',
      inscricaoMunicipal: '48291',
      endereco: ['Rua Duque de Caxias, 100 - Centro', 'Várzea Paulista - SP - CEP 13220-000'],
      contato: '(11) 4606-0000 · contato@adlertec.com.br',
    });
    expect(d.pessoa).toMatchObject({ nome: 'Mercado Bom Preço', documento: 'CPF 529.982.247-25', endereco: [], contato: '(11) 99999-0000' });
    expect(d.itens[0]).toEqual({ codigo: 'PAO-KG', descricao: 'Pão francês', quantidade: '12,5', unidade: 'KG', unitario: 'R$ 18,90', desconto: '', total: 'R$ 236,25' });
    expect(d.itens[1].desconto).toBe('R$ 5,00');
    expect(d.pagamento).toEqual([
      { parcela: '1/3', vencimento: '10/11/2026', valor: 'R$ 110,42' },
      { parcela: '2/3', vencimento: '10/12/2026', valor: 'R$ 110,42' },
      { parcela: '3/3', vencimento: '10/01/2027', valor: 'R$ 110,41' },
    ]);
  });

  it('sem vencimento é à vista; faturada usa as contas lançadas; cancelada é marcada', () => {
    expect(dadosVenda({ ...VENDA, parcelas: 1, primeiroVencimento: null }, EMPRESA, '').pagamento).toBe('À vista, no faturamento.');
    const faturada = dadosVenda(
      { ...VENDA, status: 'FATURADA', contas: [{ valor: 331.25, dataVencimento: '2026-10-25', parcela: null, totalParcelas: null, status: 'ABERTA' }] },
      EMPRESA,
      '',
    );
    expect(faturada).toMatchObject({ tipo: 'VENDA', pagamento: [{ parcela: 'Única', vencimento: '25/10/2026', valor: 'R$ 331,25' }] });
    expect(dadosVenda({ ...VENDA, status: 'CANCELADA' }, EMPRESA, '').cancelado).toBe(true);
    expect(dadosVenda({ ...VENDA, status: 'PEDIDO' }, EMPRESA, '').tipo).toBe('PEDIDO');
  });

  it('gera um PDF válido, inclusive com acentos e muitos itens', async () => {
    const itens = Array.from({ length: 80 }, (_, i) => ({ ...VENDA.itens[0], descricao: `Item número ${i} – pão de queijo`, produto: { codigo: `P${i}`, unidade: 'UN' } }));
    const pdf = await gerarPdf(montarDocumento(dadosVenda({ ...VENDA, itens }, EMPRESA, '21/10/2026 14:30')));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.subarray(-6).toString()).toMatch(/%%EOF/);
    expect(pdf.toString('latin1')).toMatch(/\/Count 3\b/);
  });
});

describe('PDF de vendas e compras', () => {
  let app: INestApplication;
  let a: Acesso;

  beforeAll(async () => {
    app = await criarApp();
  });
  beforeEach(async () => {
    await limparBanco(app);
    a = await registrarEmpresa(app);
  });
  afterAll(() => app.close());

  const produto = async () =>
    (await api(app, a.token).post('/produtos', { codigo: 'P1', descricao: 'Produto', tipo: 'PRODUTO', unidade: 'UN', precoVenda: 10 }).expect(201)).body.id;
  const pdf = (rota: string, token = a.token) => api(app, token).get(rota).buffer(true).parse((res, fim) => {
    const partes: Buffer[] = [];
    res.on('data', (c: Buffer) => partes.push(c));
    res.on('end', () => fim(null, Buffer.concat(partes)));
  });

  it('o nome e o título acompanham a situação da venda', async () => {
    const cliente = (await api(app, a.token).post('/clientes', { nome: 'Cliente', documento: '52998224725' }).expect(201)).body.id;
    const venda = (await api(app, a.token).post('/vendas', { clienteId: cliente, itens: [{ produtoId: await produto(), quantidade: 2 }] }).expect(201)).body;

    let res = await pdf(`/vendas/${venda.id}/pdf`).expect(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe(`inline; filename="Orcamento-${venda.numero}.pdf"`);
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    await api(app, a.token).post(`/vendas/${venda.id}/aprovacao`).expect(200);
    res = await pdf(`/vendas/${venda.id}/pdf`).expect(200);
    expect(res.headers['content-disposition']).toContain('Pedido-');

    await api(app, a.token).post(`/vendas/${venda.id}/faturamento`).expect(200);
    res = await pdf(`/vendas/${venda.id}/pdf`).expect(200);
    expect(res.headers['content-disposition']).toContain('Venda-');
  });

  it('pedido de compra; vendas não vê compras; outra empresa não vê nada', async () => {
    const fornecedorId = (await criarFornecedor(app, a.token)).id;
    const compra = (await api(app, a.token).post('/compras', { fornecedorId, itens: [{ produtoId: await produto(), quantidade: 3, custoUnitario: 4 }] }).expect(201)).body;
    const res = await pdf(`/compras/${compra.id}/pdf`).expect(200);
    expect(res.headers['content-disposition']).toBe(`inline; filename="Pedido-de-compra-${compra.numero}.pdf"`);

    const vendas = await adicionarUsuario(app, a, Perfil.VENDAS);
    await api(app, vendas.token).get(`/compras/${compra.id}/pdf`).expect(403);
    const b = await registrarEmpresa(app);
    await api(app, b.token).get(`/compras/${compra.id}/pdf`).expect(404);
  });

  it('a empresa guarda o contato que vai no cabeçalho', async () => {
    const contato = { telefone: '1146060000', email: 'contato@adlertec.com.br', endereco: EMPRESA.endereco };
    const { body } = await api(app, a.token).patch('/empresas/atual', contato).expect(200);
    expect(body).toMatchObject(contato);
    await api(app, a.token).patch('/empresas/atual', { email: 'invalido' }).expect(400);
    await api(app, a.token).patch('/empresas/atual', { endereco: { ...EMPRESA.endereco, cep: '1' } }).expect(400);
  });
});

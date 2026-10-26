import { INestApplication } from '@nestjs/common';
import { dadosVenda, simularCartao } from '../src/modules/documentos/dados-documento';
import { gerarDocumento, gerarPdf, montarDocumento } from '../src/modules/documentos/documento-pdf';
import { PROPOSTA_PADRAO } from '../src/modules/empresas/empresa.entity';
import { Perfil } from '../src/modules/usuarios/perfil.enum';
import { Acesso, adicionarUsuario, api, criarApp, criarFornecedor, limparBanco, registrarEmpresa } from './helpers';

/** PNG de 1x1 pixel. */
const LOGO_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

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
      contagem: '3 itens',
      bruto: 'R$ 336,25',
      descontos: 'R$ 5,00',
      total: 'R$ 331,25',
      observacoes: 'Entrega em 5 dias úteis.',
      // Padrão da empresa: validade de 10 dias e simulação no cartão em até 12x com 2% ao mês.
      validade: { ate: '31/10/2026', dias: 10 },
      formaPagamento: '3 parcelas, de 10/11/2026 a 10/01/2027',
      responsavel: null,
      destaques: [],
    });
    expect(d.empresa).toEqual({
      nome: 'Adler Tec',
      razaoSocial: 'Adler Tecnologia Ltda',
      documento: 'CNPJ 11.222.333/0001-81',
      inscricaoMunicipal: '48291',
      endereco: ['Rua Duque de Caxias, 100 - Centro', 'Várzea Paulista - SP - CEP 13220-000'],
      telefone: '(11) 4606-0000',
      email: 'contato@adlertec.com.br',
      logo: null,
    });
    expect(d.pessoa).toMatchObject({ nome: 'Mercado Bom Preço', documento: 'CPF 529.982.247-25', endereco: [], telefone: '(11) 99999-0000', email: null });
    // Sem serviços, um só grupo, com o subtotal já descontado.
    expect(d.grupos).toHaveLength(1);
    expect(d.grupos[0]).toMatchObject({ tipo: 'PRODUTO', contagem: '3 itens', subtotal: 'R$ 331,25' });
    expect(d.escopoServico).toBeNull();
    expect(d.grupos[0].itens[0]).toEqual({
      codigo: 'PAO-KG',
      descricao: 'Pão francês',
      quantidade: '12,5',
      unidade: 'KG',
      unitario: 'R$ 18,90',
      desconto: '',
      unitarioFinal: 'R$ 18,90',
      total: 'R$ 236,25',
      imagem: null,
    });
    expect(d.grupos[0].itens[1]).toMatchObject({ desconto: 'R$ 5,00', unitarioFinal: 'R$ 42,50' });
    expect(d.cartao!.linhas).toHaveLength(13);
    expect(d.cartao!.linhas.slice(0, 3)).toEqual([
      { condicao: 'À vista (Pix ou boleto)', observacao: null, parcela: 'R$ 331,25', total: 'R$ 331,25' },
      { condicao: '1x no cartão', observacao: 'sem acréscimo', parcela: 'R$ 331,25', total: 'R$ 331,25' },
      { condicao: '2x no cartão', observacao: null, parcela: 'R$ 170,61', total: 'R$ 341,22' },
    ]);
    expect(d.pagamento).toEqual([
      { parcela: '1/3', vencimento: '10/11/2026', valor: 'R$ 110,42' },
      { parcela: '2/3', vencimento: '10/12/2026', valor: 'R$ 110,42' },
      { parcela: '3/3', vencimento: '10/01/2027', valor: 'R$ 110,41' },
    ]);
  });

  it('sem vencimento é à vista; faturada usa as contas lançadas; cancelada é marcada', () => {
    const aVista = dadosVenda({ ...VENDA, parcelas: 1, primeiroVencimento: null }, EMPRESA, '', 'Adler Chaves');
    expect(aVista).toMatchObject({ pagamento: 'À vista, no faturamento.', formaPagamento: 'Pix ou boleto à vista, ou cartão em até 12x', responsavel: 'Adler Chaves' });
    const faturada = dadosVenda(
      { ...VENDA, status: 'FATURADA', contas: [{ valor: 331.25, dataVencimento: '2026-10-25', parcela: null, totalParcelas: null, status: 'ABERTA' }] },
      EMPRESA,
      '',
    );
    // Fora do orçamento não há validade nem tabela de cartão: vale a condição combinada.
    expect(faturada).toMatchObject({
      tipo: 'VENDA',
      validade: null,
      cartao: null,
      pagamento: [{ parcela: 'Única', vencimento: '25/10/2026', valor: 'R$ 331,25' }],
      formaPagamento: 'Parcela única, vencimento em 25/10/2026',
    });
    expect(dadosVenda({ ...VENDA, status: 'CANCELADA' }, EMPRESA, '').cancelado).toBe(true);
    expect(dadosVenda({ ...VENDA, status: 'PEDIDO' }, EMPRESA, '').tipo).toBe('PEDIDO');
    expect(dadosVenda({ ...VENDA, cliente: { ...VENDA.cliente, documento: null } }, EMPRESA, '').pessoa.documento).toBeNull();
  });

  it('gera um PDF válido, inclusive com acentos e muitos itens', async () => {
    const itens = Array.from({ length: 80 }, (_, i) => ({ ...VENDA.itens[0], descricao: `Item número ${i} – pão de queijo`, produto: { codigo: `P${i}`, unidade: 'UN' } }));
    const cliente = { ...VENDA.cliente, documento: null };
    const empresa = { ...EMPRESA, proposta: { ...PROPOSTA_PADRAO, destaques: ['Garantia de 12 meses', 'Atendimento em Várzea Paulista'], garantia: '12 meses', prazoEntrega: '5 dias úteis', condicoes: 'Pagamento na aprovação.' } };
    const pdf = await gerarPdf(montarDocumento(dadosVenda({ ...VENDA, cliente, itens }, empresa, '21/10/2026 14:30', 'Adler Chaves')));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.subarray(-6).toString()).toMatch(/%%EOF/);
    expect(Number(/\/Type \/Pages\n\/Count (\d+)/.exec(pdf.toString('latin1'))?.[1] ?? /\/Count (\d+)/.exec(pdf.toString('latin1'))![1])).toBeGreaterThanOrEqual(3);
  });

  it('cartão: tabela Price com 2% ao mês e 1x sem acréscimo, como a proposta de referência (até 1 centavo de arredondamento)', () => {
    const tabela = simularCartao(7398.92, { jurosCartao: 2, parcelasCartao: 12, parcelasSemJuros: 1 });
    expect(tabela.map((t) => [t.parcelas, t.parcela, t.total])).toEqual([
      [1, 7398.92, 7398.92],
      [2, 3810.81, 7621.62],
      [3, 2565.61, 7696.83],
      [4, 1943.13, 7772.52],
      [5, 1569.74, 7848.7],
      [6, 1320.9, 7925.4],
      [7, 1143.22, 8002.54],
      [8, 1010.03, 8080.24],
      [9, 906.48, 8158.32],
      [10, 823.7, 8237],
      [11, 756.01, 8316.11],
      [12, 699.64, 8395.68],
    ]);
    // Sem juros até 3x; juros zero divide tudo sem acréscimo.
    expect(simularCartao(300, { jurosCartao: 2, parcelasCartao: 4, parcelasSemJuros: 3 }).map((t) => [t.parcela, t.total, t.semJuros])).toEqual([
      [300, 300, true],
      [150, 300, true],
      [100, 300, true],
      [78.79, 315.16, false],
    ]);
    expect(simularCartao(100, { jurosCartao: 0, parcelasCartao: 3, parcelasSemJuros: 1 }).every((t) => t.semJuros && t.total === 100)).toBe(true);
  });

  it('produtos e serviços em grupos separados, com subtotais que somam o total; escopo do serviço; sem parcelamento', async () => {
    const itens = [
      { ...VENDA.itens[1], produto: { codigo: 'BOLO', unidade: 'UN', tipo: 'PRODUTO', imagem: LOGO_PNG } },
      { descricao: 'Instalação', quantidade: 3, precoUnitario: 80, desconto: 0, total: 240, produto: { codigo: 'INST', unidade: 'H', tipo: 'SERVICO' } },
      { ...VENDA.itens[0], produto: { ...VENDA.itens[0].produto, tipo: 'PRODUTO' } },
    ];
    const venda = { ...VENDA, itens, total: 561.25, escopoServico: 'MATERIAL_INCLUSO' };
    const d = dadosVenda(venda, EMPRESA, '');
    expect(d.grupos.map((g) => [g.tipo, g.contagem, g.subtotal, g.itens.map((i) => i.codigo)])).toEqual([
      ['PRODUTO', '2 itens', 'R$ 321,25', ['BOLO', 'PAO-KG']],
      ['SERVICO', '1 item', 'R$ 240,00', ['INST']],
    ]);
    expect(d.grupos[0].itens[0].imagem).toBe(LOGO_PNG);
    expect(d).toMatchObject({ contagem: '3 itens', bruto: 'R$ 566,25', descontos: 'R$ 5,00', total: 'R$ 561,25' });
    expect(d.escopoServico).toEqual({ valor: 'Material e mão de obra', detalhe: 'Material incluso no valor' });
    expect(d.cartao).not.toBeNull();
    expect(dadosVenda({ ...venda, escopoServico: 'MAO_DE_OBRA' }, EMPRESA, '').escopoServico?.valor).toBe('Somente mão de obra');

    // Sem a tabela do cartão, a forma de pagamento volta a ser a condição combinada.
    const semParcelamento = dadosVenda({ ...venda, parcelas: 1, primeiroVencimento: null, exibirParcelamento: false }, EMPRESA, '');
    expect(semParcelamento).toMatchObject({ cartao: null, formaPagamento: 'À vista, no faturamento' });

    const pdf = await gerarDocumento(d);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.toString('latin1')).toMatch(/\/Subtype \/Image/);
    // Foto corrompida não impede a geração.
    const corrompida = `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 7)]).toString('base64')}`;
    const comFotoRuim = dadosVenda({ ...venda, itens: [{ ...itens[0], produto: { ...itens[0].produto, imagem: corrompida } }, itens[1]] }, EMPRESA, '');
    expect((await gerarDocumento(comFotoRuim)).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('com logo em PNG gera o PDF; logo corrompido não impede a geração', async () => {
    const dados = dadosVenda(VENDA, { ...EMPRESA, logo: LOGO_PNG }, '');
    expect((await gerarDocumento(dados)).subarray(0, 5).toString()).toBe('%PDF-');
    const corrompido = `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 7)]).toString('base64')}`;
    expect((await gerarDocumento(dadosVenda(VENDA, { ...EMPRESA, logo: corrompido }, ''))).subarray(0, 5).toString()).toBe('%PDF-');
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
    const cliente = (await api(app, a.token).post('/clientes', { nome: 'Cliente sem documento' }).expect(201)).body.id;
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

  it('orçamento guarda o escopo do serviço e a escolha do parcelamento; o PDF leva a foto do produto', async () => {
    const cliente = (await api(app, a.token).post('/clientes', { nome: 'Cliente' }).expect(201)).body.id;
    const servico = (
      await api(app, a.token).post('/produtos', { codigo: 'S1', descricao: 'Instalação', tipo: 'SERVICO', unidade: 'H', precoVenda: 80 }).expect(201)
    ).body.id;
    const produtoId = await produto();
    const itens = [{ produtoId, quantidade: 1 }, { produtoId: servico, quantidade: 2 }];
    let venda = (await api(app, a.token).post('/vendas', { clienteId: cliente, itens }).expect(201)).body;
    expect(venda).toMatchObject({ escopoServico: null, exibirParcelamento: true });
    venda = (await api(app, a.token).patch(`/vendas/${venda.id}`, { escopoServico: 'MAO_DE_OBRA', exibirParcelamento: false }).expect(200)).body;
    expect(venda).toMatchObject({ escopoServico: 'MAO_DE_OBRA', exibirParcelamento: false });
    await api(app, a.token).patch(`/vendas/${venda.id}`, { escopoServico: 'OUTRO' }).expect(400);
    expect((await api(app, a.token).patch(`/vendas/${venda.id}`, { escopoServico: null }).expect(200)).body.escopoServico).toBeNull();

    // A foto é opcional, fica fora do cadastro comum e segue as regras do logo.
    expect((await api(app, a.token).get(`/produtos/${produtoId}/imagem`).expect(200)).body).toEqual({ imagem: null });
    expect((await pdf(`/vendas/${venda.id}/pdf`).expect(200)).body.toString('latin1')).not.toMatch(/\/Subtype \/Image/);
    await api(app, a.token).put(`/produtos/${produtoId}/imagem`, { imagem: 'data:image/svg+xml;base64,PHN2Zz4=' }).expect(400);
    await api(app, a.token).put(`/produtos/${produtoId}/imagem`, { imagem: LOGO_PNG }).expect(200);
    expect((await api(app, a.token).get(`/produtos/${produtoId}/imagem`).expect(200)).body.imagem).toBe(LOGO_PNG);
    expect((await api(app, a.token).get(`/produtos/${produtoId}`).expect(200)).body).not.toHaveProperty('imagem');
    expect((await api(app, a.token).get('/produtos').expect(200)).body[0]).not.toHaveProperty('imagem');
    expect((await pdf(`/vendas/${venda.id}/pdf`).expect(200)).body.toString('latin1')).toMatch(/\/Subtype \/Image/);

    const b = await registrarEmpresa(app);
    await api(app, b.token).get(`/produtos/${produtoId}/imagem`).expect(404);
    await api(app, b.token).put(`/produtos/${produtoId}/imagem`, { imagem: LOGO_PNG }).expect(404);
    await api(app, a.token).delete(`/produtos/${produtoId}/imagem`).expect(204);
    expect((await api(app, a.token).get(`/produtos/${produtoId}/imagem`).expect(200)).body.imagem).toBeNull();
  });

  it('a empresa guarda o contato que vai no cabeçalho', async () => {
    const contato = { telefone: '1146060000', email: 'contato@adlertec.com.br', endereco: EMPRESA.endereco };
    const { body } = await api(app, a.token).patch('/empresas/atual', contato).expect(200);
    expect(body).toMatchObject(contato);
    await api(app, a.token).patch('/empresas/atual', { email: 'invalido' }).expect(400);
    await api(app, a.token).patch('/empresas/atual', { endereco: { ...EMPRESA.endereco, cep: '1' } }).expect(400);
  });

  it('configuração da proposta: padrão de 2% em 12x, substituída por inteiro e validada', async () => {
    expect((await api(app, a.token).get('/empresas/atual').expect(200)).body.proposta).toEqual(PROPOSTA_PADRAO);
    const proposta = {
      ...PROPOSTA_PADRAO,
      destaques: ['Garantia de 12 meses', 'Nota máxima no atendimento'],
      validadeDias: 15,
      prazoEntrega: '5 a 10 dias úteis',
      garantia: '12 meses',
      condicoes: 'Instalação inclusa.',
      jurosCartao: 2.49,
      parcelasCartao: 10,
      parcelasSemJuros: 3,
    };
    expect((await api(app, a.token).patch('/empresas/atual', { proposta }).expect(200)).body.proposta).toEqual(proposta);
    for (const invalida of [
      { destaques: ['a', 'b', 'c', 'd', 'e'] },
      { destaques: ['x'.repeat(46)] },
      { jurosCartao: 16 },
      { jurosCartao: 1.234 },
      { parcelasCartao: 25 },
      { parcelasSemJuros: 11 },
      { validadeDias: 0 },
      { simularCartao: 'sim' },
    ]) {
      await api(app, a.token).patch('/empresas/atual', { proposta: { ...proposta, ...invalida } }).expect(400);
    }
    // Configuração incompleta é recusada: a proposta é sempre enviada por inteiro.
    await api(app, a.token).patch('/empresas/atual', { proposta: { destaques: [] } }).expect(400);
    const vendas = await adicionarUsuario(app, a, Perfil.VENDAS);
    await api(app, vendas.token).patch('/empresas/atual', { proposta }).expect(403);
  });

  it('logo: só PNG ou JPEG de verdade, até 400 KB; fica fora da empresa e da auditoria', async () => {
    expect((await api(app, a.token).get('/empresas/atual/logo').expect(200)).body).toEqual({ logo: null });
    await api(app, a.token).put('/empresas/atual/logo', { imagem: LOGO_PNG }).expect(200);
    expect((await api(app, a.token).get('/empresas/atual/logo').expect(200)).body.logo).toBe(LOGO_PNG);
    expect((await api(app, a.token).get('/empresas/atual').expect(200)).body).not.toHaveProperty('logo');

    const falso = `data:image/png;base64,${Buffer.from('<svg onload=alert(1)>').toString('base64')}`;
    for (const imagem of [falso, 'data:image/svg+xml;base64,PHN2Zz4=', 'https://exemplo.com/logo.png', LOGO_PNG.replace('png', 'jpeg')]) {
      await api(app, a.token).put('/empresas/atual/logo', { imagem }).expect(400);
    }
    const grande = `data:image/png;base64,${Buffer.concat([Buffer.from(LOGO_PNG.split(',')[1], 'base64'), Buffer.alloc(410 * 1024)]).toString('base64')}`;
    await api(app, a.token).put('/empresas/atual/logo', { imagem: grande }).expect(400);

    const vendas = await adicionarUsuario(app, a, Perfil.VENDAS);
    await api(app, vendas.token).put('/empresas/atual/logo', { imagem: LOGO_PNG }).expect(403);

    // O PDF sai com o logo; a auditoria registra a troca sem guardar a imagem (um logo de verdade tem vários KB).
    const medio = `data:image/png;base64,${Buffer.concat([Buffer.from(LOGO_PNG.split(',')[1], 'base64'), Buffer.alloc(5000)]).toString('base64')}`;
    await api(app, a.token).put('/empresas/atual/logo', { imagem: medio }).expect(200);
    const cliente = (await api(app, a.token).post('/clientes', { nome: 'Cliente' }).expect(201)).body.id;
    const venda = (await api(app, a.token).post('/vendas', { clienteId: cliente, itens: [{ produtoId: await produto(), quantidade: 1 }] }).expect(201)).body;
    const res = await pdf(`/vendas/${venda.id}/pdf`).expect(200);
    expect((res.body as Buffer).toString('latin1')).toMatch(/\/Subtype \/Image/);
    const auditoria = await api(app, a.token).get('/auditoria?recurso=empresas').expect(200);
    const troca = auditoria.body.itens.find((r: { acao: string; dados: { imagem: string } }) => r.acao === 'PUT /api/empresas/atual/logo' && r.dados.imagem.startsWith('['));
    expect(troca.dados.imagem).toMatch(/^\[\d+ caracteres omitidos\]$/);

    await api(app, a.token).delete('/empresas/atual/logo').expect(204);
    expect((await api(app, a.token).get('/empresas/atual/logo').expect(200)).body.logo).toBeNull();
  });
});

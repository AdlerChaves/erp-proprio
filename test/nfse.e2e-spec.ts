import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { validarDps } from '../src/modules/nfse/dps';
import { Perfil } from '../src/modules/usuarios/perfil.enum';
import { Acesso, adicionarUsuario, api, criarApp, limparBanco, registrarEmpresa } from './helpers';

/** CPF com dígitos verificadores corretos a partir de 9 dígitos. */
function cpf(base: number) {
  const d = String(base).padStart(9, '0').split('').map(Number);
  for (const tamanho of [9, 10]) {
    const resto = d.slice(0, tamanho).reduce((s, n, i) => s + n * (tamanho + 1 - i), 0) % 11;
    d.push(resto < 2 ? 0 : 11 - resto);
  }
  return d.join('');
}

const FISCAL = {
  inscricaoMunicipal: '12345',
  codigoMunicipio: '3556503',
  regimeTributario: 'SIMPLES_NACIONAL',
  aliquotaSimples: 6,
};
const ENDERECO = { cep: '13220000', logradouro: 'Rua Duque de Caxias', numero: '100', bairro: 'Centro', codigoMunicipio: '3556503' };

describe('Nota fiscal de serviço (DPS nacional)', () => {
  let app: INestApplication;
  let a: Acesso;
  let clienteId: string;
  let sequencia = 100_000_000;

  beforeAll(async () => {
    app = await criarApp();
  });
  beforeEach(async () => {
    await limparBanco(app);
    a = await registrarEmpresa(app);
    await api(app, a.token).patch('/empresas/atual', FISCAL).expect(200);
    clienteId = (
      await api(app, a.token)
        .post('/clientes', { nome: 'Mercado Bom Preço', documento: cpf(++sequencia), endereco: ENDERECO, email: 'compras@bompreco.com.br' })
        .expect(201)
    ).body.id;
  });
  afterAll(() => app.close());

  let codigo = 0;
  const servico = (dados: object = {}) =>
    api(app, a.token)
      .post('/produtos', {
        codigo: `S${++codigo}`,
        descricao: `Suporte técnico ${codigo}`,
        tipo: 'SERVICO',
        unidade: 'H',
        precoVenda: 100,
        codigoServico: '01.07',
        codigoTributacaoNacional: '010701',
        ...dados,
      })
      .expect(201)
      .then((r) => r.body as { id: string });
  const produto = () =>
    api(app, a.token)
      .post('/produtos', { codigo: `P${++codigo}`, descricao: 'Cabo de rede', tipo: 'PRODUTO', unidade: 'UN', precoVenda: 30 })
      .expect(201)
      .then((r) => r.body as { id: string });
  const venderFaturar = async (itens: object[], cliente = clienteId) => {
    const venda = (await api(app, a.token).post('/vendas', { clienteId: cliente, status: 'PEDIDO', itens, dataEmissao: '2026-10-01' }).expect(201)).body;
    await api(app, a.token).post(`/vendas/${venda.id}/faturamento`, { data: '2026-10-05' }).expect(200);
    return venda as { id: string; numero: number };
  };
  const gerar = (vendaId: string, corpo: object = {}, token = a.token) => api(app, token).post(`/vendas/${vendaId}/notas-servico`, corpo);
  const xmlDe = async (notaId: string) => {
    const res = await api(app, a.token).get(`/notas-servico/${notaId}/xml`).expect(200);
    expect(res.headers['content-type']).toMatch(/application\/xml/);
    return res.text;
  };
  const campo = (xml: string, nome: string) => xml.match(new RegExp(`<${nome}>([^<]*)</${nome}>`))?.[1];

  describe('cadastros fiscais', () => {
    it('a empresa guarda e valida os dados fiscais', async () => {
      const { body } = await api(app, a.token).get('/empresas/atual').expect(200);
      expect(body).toMatchObject({ ...FISCAL, regimeApuracaoSimples: 1, nfseSerie: '1', nfseAmbiente: 2 });
      await api(app, a.token).patch('/empresas/atual', { codigoMunicipio: '9999999' }).expect(400);
      await api(app, a.token).patch('/empresas/atual', { nfseSerie: '50000' }).expect(400);
      await api(app, a.token).patch('/empresas/atual', { regimeApuracaoSimples: 4 }).expect(400);
    });

    it('o cliente aceita endereço válido e recusa CEP ou município inexistente', async () => {
      const { body } = await api(app, a.token).get(`/clientes/${clienteId}`).expect(200);
      expect(body.endereco).toEqual(ENDERECO);
      await api(app, a.token).patch(`/clientes/${clienteId}`, { endereco: { ...ENDERECO, cep: '1322000' } }).expect(400);
      await api(app, a.token).patch(`/clientes/${clienteId}`, { endereco: { ...ENDERECO, codigoMunicipio: '3556500' } }).expect(400);
      await api(app, a.token).patch(`/clientes/${clienteId}`, { endereco: null }).expect(200);
    });

    it('o código nacional só vale para serviços, precisa existir e bater com o item da LC 116', async () => {
      await api(app, a.token)
        .post('/produtos', { codigo: 'X1', descricao: 'X', tipo: 'PRODUTO', unidade: 'UN', precoVenda: 1, codigoTributacaoNacional: '010701' })
        .expect(400);
      const r1 = await api(app, a.token)
        .post('/produtos', { codigo: 'X2', descricao: 'X', tipo: 'SERVICO', unidade: 'H', precoVenda: 1, codigoTributacaoNacional: '019999' })
        .expect(400);
      expect(r1.body.message).toMatch(/não existe na lista nacional/);
      const r2 = await api(app, a.token)
        .post('/produtos', { codigo: 'X3', descricao: 'X', tipo: 'SERVICO', unidade: 'H', precoVenda: 1, codigoServico: '14.01', codigoTributacaoNacional: '010701' })
        .expect(400);
      expect(r2.body.message).toMatch(/não corresponde ao item 14.01/);
    });

    it('catálogos de municípios e serviços para as telas', async () => {
      const m = await api(app, a.token).get('/nfse/municipios?busca=várzea&uf=SP').expect(200);
      expect(m.body).toEqual([{ codigo: '3556503', nome: 'Várzea Paulista', uf: 'SP' }]);
      const s = await api(app, a.token).get('/nfse/servicos?busca=suporte').expect(200);
      expect(s.body.map((x: { codigo: string }) => x.codigo)).toContain('010701');
    });
  });

  describe('geração da DPS', () => {
    it('gera uma DPS válida com os serviços da venda, ignorando produtos', async () => {
      const s = await servico({ precoVenda: 150 });
      const p = await produto();
      const venda = await venderFaturar([
        { produtoId: s.id, quantidade: 2, desconto: 20 },
        { produtoId: p.id, quantidade: 1 },
      ]);

      const { body } = await gerar(venda.id).expect(201);
      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({
        status: 'PENDENTE',
        numeroDps: 1,
        serie: '1',
        ambiente: 2,
        dataCompetencia: '2026-10-05',
        codigoTributacaoNacional: '010701',
        valorServicos: 300,
        descontoIncondicionado: 20,
        issRetido: false,
        municipioPrestacao: '3556503',
        clienteId,
        vendaId: venda.id,
      });
      expect(body[0].descricao).toBe(`Suporte técnico ${codigo - 1} - 2 x R$ 150,00\nRef. venda nº ${venda.numero}`);
      expect(body[0].xmlDps).toBeUndefined();

      const xml = await xmlDe(body[0].id);
      expect(await validarDps(xml)).toEqual([]);
      expect(campo(xml, 'vServ')).toBe('300.00');
      expect(campo(xml, 'vDescIncond')).toBe('20.00');
      expect(campo(xml, 'IM')).toBe('12345');
      expect(campo(xml, 'cMun')).toBe('3556503');
      expect(campo(xml, 'pTotTribSN')).toBe('6.00');
      expect(xml).toContain('<xNome>Mercado Bom Preço</xNome>');
    });

    it('serviços com códigos diferentes geram uma nota cada, com números em sequência', async () => {
      const s1 = await servico();
      const s2 = await servico({ codigoServico: '17.01', codigoTributacaoNacional: '170101' });
      const venda = await venderFaturar([
        { produtoId: s1.id, quantidade: 1 },
        { produtoId: s2.id, quantidade: 1 },
      ]);
      const { body } = await gerar(venda.id).expect(201);
      expect(body.map((n: { numeroDps: number; codigoTributacaoNacional: string }) => [n.numeroDps, n.codigoTributacaoNacional])).toEqual([
        [1, '010701'],
        [2, '170101'],
      ]);
      const repetida = await gerar(venda.id).expect(409);
      expect(repetida.body.message).toMatch(/já tem nota de serviço/);
      // Com duas notas, a descrição é montada por nota e não pode ser trocada por uma só.
      await gerar(venda.id, { descricao: 'Uma só' }).expect(400);
    });

    it('com ISS retido, exige e informa a alíquota', async () => {
      const s = await servico();
      const venda = await venderFaturar([{ produtoId: s.id, quantidade: 1 }]);
      const r = await gerar(venda.id, { issRetido: true }).expect(400);
      expect(r.body.message).toMatch(/alíquota de ISS/);
      await gerar(venda.id, { issRetido: true, aliquotaIss: 6 }).expect(400);
      const { body } = await gerar(venda.id, { issRetido: true, aliquotaIss: 2.5, descricao: 'Suporte de outubro' }).expect(201);
      const xml = await xmlDe(body[0].id);
      expect(await validarDps(xml)).toEqual([]);
      expect([campo(xml, 'tpRetISSQN'), campo(xml, 'pAliq'), campo(xml, 'xDescServ')]).toEqual(['2', '2.50', 'Suporte de outubro']);
    });

    it('diz tudo o que falta na empresa antes de gerar', async () => {
      const s = await servico();
      const venda = await venderFaturar([{ produtoId: s.id, quantidade: 1 }]);
      await api(app, a.token).patch('/empresas/atual', { inscricaoMunicipal: null, aliquotaSimples: null }).expect(200);
      const r = await gerar(venda.id).expect(400);
      expect(r.body.message).toBe('Preencha os dados fiscais da empresa: inscrição municipal, percentual aproximado de tributos do Simples');
    });

    it('recusa empresa com CNPJ de dígito inválido', async () => {
      const s = await servico();
      const venda = await venderFaturar([{ produtoId: s.id, quantidade: 1 }]);
      await app.get(DataSource).query(`UPDATE empresas SET cnpj = '11222333000182' WHERE id = $1`, [a.empresaId]);
      expect((await gerar(venda.id).expect(400)).body.message).toMatch(/CNPJ da empresa/);
    });

    it('recusa venda não faturada, sem serviços, serviço sem código e cliente com documento inválido', async () => {
      const s = await servico();
      const pedido = (await api(app, a.token).post('/vendas', { clienteId, status: 'PEDIDO', itens: [{ produtoId: s.id, quantidade: 1 }] }).expect(201)).body;
      await gerar(pedido.id).expect(400);

      const so = await venderFaturar([{ produtoId: (await produto()).id, quantidade: 1 }]);
      expect((await gerar(so.id).expect(400)).body.message).toMatch(/não tem serviços/);

      const semCodigo = await servico({ codigoServico: undefined, codigoTributacaoNacional: undefined, descricao: 'Consultoria' });
      const v2 = await venderFaturar([{ produtoId: semCodigo.id, quantidade: 1 }]);
      expect((await gerar(v2.id).expect(400)).body.message).toBe('Informe o código de tributação nacional no cadastro de: Consultoria');

      const invalido = (await api(app, a.token).post('/clientes', { nome: 'Doc errado', documento: '11222333000182' }).expect(201)).body;
      const v3 = await venderFaturar([{ produtoId: s.id, quantidade: 1 }], invalido.id);
      expect((await gerar(v3.id).expect(400)).body.message).toMatch(/CPF\/CNPJ do cliente Doc errado é inválido/);
    });

    it('duas gerações simultâneas da mesma venda: só uma passa', async () => {
      const s = await servico();
      const venda = await venderFaturar([{ produtoId: s.id, quantidade: 1 }]);
      const status = (await Promise.all([1, 2, 3].map(() => gerar(venda.id)))).map((r) => r.status).sort();
      expect(status).toEqual([201, 409, 409]);
    });
  });

  describe('emissão e cancelamento', () => {
    const notaPendente = async () => {
      const venda = await venderFaturar([{ produtoId: (await servico()).id, quantidade: 1 }]);
      const nota = (await gerar(venda.id).expect(201)).body[0];
      return { venda, nota };
    };

    it('registra o número da NFS-e emitida no portal', async () => {
      const { nota } = await notaPendente();
      const { body } = await api(app, a.token)
        .post(`/notas-servico/${nota.id}/emissao`, { numeroNfse: '000123', dataEmissao: '2026-10-06', codigoVerificacao: 'AB12CD' })
        .expect(200);
      expect(body).toMatchObject({ status: 'EMITIDA', numeroNfse: '123', dataEmissaoNfse: '2026-10-06', codigoVerificacao: 'AB12CD' });
      await api(app, a.token).post(`/notas-servico/${nota.id}/emissao`, { numeroNfse: '124', dataEmissao: '2026-10-06' }).expect(400);

      const outra = await notaPendente();
      await api(app, a.token).post(`/notas-servico/${outra.nota.id}/emissao`, { numeroNfse: '123', dataEmissao: '2026-10-06' }).expect(409);
      await api(app, a.token).post(`/notas-servico/${outra.nota.id}/emissao`, { numeroNfse: '125', dataEmissao: '2026-10-01' }).expect(400);
    });

    it('venda com nota emitida só é cancelada depois de cancelar a nota', async () => {
      const { venda, nota } = await notaPendente();
      await api(app, a.token).post(`/notas-servico/${nota.id}/emissao`, { numeroNfse: '7', dataEmissao: '2026-10-06' }).expect(200);
      expect((await api(app, a.token).post(`/vendas/${venda.id}/cancelamento`).expect(400)).body.message).toMatch(/nota de serviço emitida/);

      await api(app, a.token).post(`/notas-servico/${nota.id}/cancelamento`, { motivo: 'abc' }).expect(400);
      const { body } = await api(app, a.token).post(`/notas-servico/${nota.id}/cancelamento`, { motivo: 'Valor errado' }).expect(200);
      expect(body).toMatchObject({ status: 'CANCELADA', motivoCancelamento: 'Valor errado' });
      await api(app, a.token).post(`/vendas/${venda.id}/cancelamento`).expect(200);
    });

    it('cancelar a venda cancela a nota pendente, e a numeração da DPS não volta', async () => {
      const { venda, nota } = await notaPendente();
      await api(app, a.token).post(`/vendas/${venda.id}/cancelamento`).expect(200);
      const { body } = await api(app, a.token).get(`/notas-servico/${nota.id}`).expect(200);
      expect(body).toMatchObject({ status: 'CANCELADA', motivoCancelamento: 'Venda cancelada' });
      const nova = await notaPendente();
      expect(nova.nota.numeroDps).toBe(nota.numeroDps + 1);
    });

    it('depois de cancelada, a venda pode ganhar uma nota nova', async () => {
      const { venda, nota } = await notaPendente();
      await api(app, a.token).post(`/notas-servico/${nota.id}/cancelamento`, { motivo: 'Descrição errada' }).expect(200);
      const { body } = await gerar(venda.id, { descricao: 'Descrição certa' }).expect(201);
      expect(body[0].numeroDps).toBe(nota.numeroDps + 1);
      const lista = await api(app, a.token).get(`/notas-servico?vendaId=${venda.id}`).expect(200);
      expect(lista.body.map((n: { status: string }) => n.status)).toEqual(['PENDENTE', 'CANCELADA']);
    });
  });

  describe('acesso', () => {
    it('vendas e consulta leem as notas, mas não geram nem registram', async () => {
      const venda = await venderFaturar([{ produtoId: (await servico()).id, quantidade: 1 }]);
      for (const perfil of [Perfil.VENDAS, Perfil.CONSULTA]) {
        const u = await adicionarUsuario(app, a, perfil);
        await gerar(venda.id, {}, u.token).expect(403);
      }
      const nota = (await gerar(venda.id).expect(201)).body[0];
      const vendedor = await adicionarUsuario(app, a, Perfil.VENDAS);
      await api(app, vendedor.token).get(`/notas-servico/${nota.id}`).expect(200);
      await api(app, vendedor.token).post(`/notas-servico/${nota.id}/emissao`, { numeroNfse: '1', dataEmissao: '2026-10-06' }).expect(403);
    });

    it('outra empresa não vê a nota nem o XML', async () => {
      const venda = await venderFaturar([{ produtoId: (await servico()).id, quantidade: 1 }]);
      const nota = (await gerar(venda.id).expect(201)).body[0];
      const b = await registrarEmpresa(app);
      await api(app, b.token).get(`/notas-servico/${nota.id}`).expect(404);
      await api(app, b.token).get(`/notas-servico/${nota.id}/xml`).expect(404);
      await api(app, b.token).post(`/vendas/${venda.id}/notas-servico`).expect(404);
      expect((await api(app, b.token).get('/notas-servico').expect(200)).body).toEqual([]);
    });
  });
});

import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { hoje } from '../src/common/datas';
import { AgendadorContratos } from '../src/modules/contratos/agendador';
import { mesSeguinte } from '../src/modules/contratos/geracao.service';
import { AmbienteNfse } from '../src/modules/empresas/empresa.entity';
import { OPCOES_SEFIN } from '../src/modules/nfse/sefin';
import { Perfil } from '../src/modules/usuarios/perfil.enum';
import { Acesso, adicionarUsuario, api, criarApp, limparBanco, registrarEmpresa } from './helpers';
import { SefinFalsa } from './sefin-falsa';

const FISCAL = { inscricaoMunicipal: '12345', codigoMunicipio: '3556503', regimeTributario: 'SIMPLES_NACIONAL', aliquotaSimples: 6 };
/** O mês de hoje e o anterior: a geração não aceita mês futuro, então os testes andam em volta do relógio. */
const ATUAL = hoje().slice(0, 7);
const ANTERIOR = mesSeguinte(ATUAL, -1);

jest.setTimeout(30_000);

describe('Contratos recorrentes', () => {
  let app: INestApplication;
  let sefin: SefinFalsa;
  let a: Acesso;
  let cnpj: string;
  let clienteId: string;
  let servicoId: string;
  let produtoId: string;

  beforeAll(async () => {
    sefin = await new SefinFalsa().iniciar();
    app = await criarApp((m) =>
      m.overrideProvider(OPCOES_SEFIN).useValue({
        urls: { [AmbienteNfse.PRODUCAO]: sefin.url, [AmbienteNfse.HOMOLOGACAO]: sefin.url },
        ca: [sefin.caPem],
        timeoutMs: 10_000,
      }),
    );
  });
  beforeEach(async () => {
    await limparBanco(app);
    sefin.modo = 'emitir';
    sefin.recebidas.length = 0;
    sefin.emitidas.clear();
    a = await registrarEmpresa(app);
    cnpj = (await api(app, a.token).patch('/empresas/atual', FISCAL).expect(200)).body.cnpj;
    clienteId = (await api(app, a.token).post('/clientes', { nome: 'Padaria Pão Quente', documento: '11222333000181' }).expect(201)).body.id;
    servicoId = (
      await api(app, a.token)
        .post('/produtos', {
          codigo: 'S1',
          descricao: 'Suporte técnico mensal',
          tipo: 'SERVICO',
          unidade: 'UN',
          precoVenda: 400,
          codigoServico: '01.07',
          codigoTributacaoNacional: '010701',
        })
        .expect(201)
    ).body.id;
    produtoId = (await api(app, a.token).post('/produtos', { codigo: 'P1', descricao: 'Licença antivírus', tipo: 'PRODUTO', unidade: 'UN', precoVenda: 30 }).expect(201))
      .body.id;
  });
  afterAll(async () => {
    await app.close();
    sefin.fechar();
  });

  const novo = (dados: object = {}, token = a.token) =>
    api(app, token)
      .post('/contratos')
      .send({
        clienteId,
        descricao: 'Suporte mensal',
        itens: [{ produtoId: servicoId, quantidade: 1, precoUnitario: 350 }],
        inicio: ANTERIOR,
        diaFaturamento: 1,
        diaVencimento: 10,
        ...dados,
      });
  const gerar = (id: string, competencia: string, token = a.token) => api(app, token).post(`/contratos/${id}/geracoes`).send({ competencia });
  const mes = async (competencia: string) => (await api(app, a.token).get(`/contratos/mes?competencia=${competencia}`).expect(200)).body;
  const vendasDoContrato = async (contratoId: string) =>
    (await app.get(DataSource).query(`SELECT id, status, competencia_contrato FROM vendas WHERE contrato_id = $1 ORDER BY numero`, [contratoId])) as {
      id: string;
      status: string;
      competencia_contrato: string;
    }[];

  describe('cadastro', () => {
    it('cria com número sequencial e valor mensal pela soma dos itens, com o preço combinado', async () => {
      const { body } = await novo({
        itens: [
          { produtoId: servicoId, quantidade: 2, precoUnitario: 200, desconto: 50 },
          { produtoId: produtoId, quantidade: 3 },
        ],
      }).expect(201);
      expect(body).toMatchObject({ numero: 1, situacao: 'ATIVO', valor: 440, inicio: ANTERIOR, fim: null, emitirNfse: false, geracoes: [] });
      expect(body.itens.map((i: { precoUnitario: number; total: number }) => [i.precoUnitario, i.total])).toEqual([
        [200, 350],
        [30, 90],
      ]);
      expect((await novo().expect(201)).body.numero).toBe(2);
    });

    it('recusa combinações sem sentido', async () => {
      const msg = async (dados: object) => (await novo(dados).expect(400)).body.message;
      expect(await msg({ emitirNfse: true, itens: [{ produtoId, quantidade: 1 }] })).toMatch(/ao menos um serviço/);
      expect(await msg({ transmitirNfse: true })).toMatch(/ative também a emissão/);
      expect(await msg({ inicio: ATUAL, fim: ANTERIOR })).toMatch(/fim do contrato não pode ser antes do início/);
      expect(await msg({ diaFaturamento: 29 })).toEqual(expect.arrayContaining([expect.stringMatching(/diaFaturamento/)]));
      expect(await msg({ inicio: '2026-13' })).toEqual(expect.arrayContaining([expect.stringMatching(/AAAA-MM/)]));
      expect(await msg({ itens: [{ produtoId: servicoId, quantidade: 1, precoUnitario: 0 }] })).toMatch(/maior que zero/);
    });

    it('alterar vale para as próximas cobranças; o início não passa de uma já gerada', async () => {
      const contrato = (await novo().expect(201)).body;
      await gerar(contrato.id, ANTERIOR).expect(200);
      const { body } = await api(app, a.token)
        .patch(`/contratos/${contrato.id}`)
        .send({ itens: [{ produtoId: servicoId, quantidade: 1, precoUnitario: 380 }] })
        .expect(200);
      expect(body.valor).toBe(380);
      const [venda] = await vendasDoContrato(contrato.id);
      expect((await api(app, a.token).get(`/vendas/${venda.id}`).expect(200)).body.total).toBe(350);
      expect((await api(app, a.token).patch(`/contratos/${contrato.id}`).send({ inicio: ATUAL }).expect(400)).body.message).toMatch(/início não pode ser depois/);
      expect((await api(app, a.token).delete(`/contratos/${contrato.id}`).expect(400)).body.message).toMatch(/encerre-o em vez de excluir/);
    });

    it('pausa, reativa e encerra; encerrado é definitivo; quem nunca gerou pode ser excluído', async () => {
      const contrato = (await novo().expect(201)).body;
      expect((await api(app, a.token).post(`/contratos/${contrato.id}/pausa`).expect(200)).body.situacao).toBe('PAUSADO');
      expect((await gerar(contrato.id, ANTERIOR).expect(400)).body.message).toMatch(/está pausado/);
      expect((await api(app, a.token).post(`/contratos/${contrato.id}/reativacao`).expect(200)).body.situacao).toBe('ATIVO');
      expect((await api(app, a.token).post(`/contratos/${contrato.id}/encerramento`).expect(200)).body.situacao).toBe('ENCERRADO');
      await api(app, a.token).post(`/contratos/${contrato.id}/reativacao`).expect(400);
      await api(app, a.token).patch(`/contratos/${contrato.id}`).send({ descricao: 'Outro' }).expect(400);
      await api(app, a.token).delete(`/contratos/${contrato.id}`).expect(204);
    });

    it('vendas e consulta só leem; outra empresa não vê', async () => {
      const contrato = (await novo().expect(201)).body;
      for (const perfil of [Perfil.VENDAS, Perfil.CONSULTA]) {
        const u = await adicionarUsuario(app, a, perfil);
        await api(app, u.token).get(`/contratos/${contrato.id}`).expect(200);
        await novo({}, u.token).expect(403);
        await gerar(contrato.id, ANTERIOR, u.token).expect(403);
        await api(app, u.token).post(`/contratos/${contrato.id}/pausa`).expect(403);
      }
      const b = await registrarEmpresa(app);
      await api(app, b.token).get(`/contratos/${contrato.id}`).expect(404);
      await gerar(contrato.id, ANTERIOR, b.token).expect(404);
      expect((await api(app, b.token).get(`/contratos/mes?competencia=${ANTERIOR}`).expect(200)).body.itens).toEqual([]);
    });
  });

  describe('geração da cobrança do mês', () => {
    it('gera a venda faturada com a conta a receber no vencimento combinado e a DPS da nota', async () => {
      // Vencimento (dia 5) antes do faturamento (dia 20): vence no mês seguinte.
      const contrato = (await novo({ diaFaturamento: 20, diaVencimento: 5, emitirNfse: true, observacoes: 'Atendimento remoto' }).expect(201)).body;
      const { body } = await gerar(contrato.id, ANTERIOR).expect(200);
      expect(body).toMatchObject({
        estado: 'NOTA_PENDENTE',
        faturamento: `${ANTERIOR}-20`,
        vencimento: `${ATUAL}-05`,
        geracao: { situacao: 'CONCLUIDA', erro: null, automatica: false },
        venda: { status: 'FATURADA', total: 350 },
      });
      expect(body.notas).toEqual([expect.objectContaining({ status: 'PENDENTE', numeroDps: 1 })]);

      const venda = (await api(app, a.token).get(`/vendas/${body.venda.id}`).expect(200)).body;
      expect(venda).toMatchObject({ contratoId: contrato.id, competenciaContrato: ANTERIOR, dataEmissao: `${ANTERIOR}-20`, dataFaturamento: `${ANTERIOR}-20` });
      expect(venda.observacoes).toBe(`Contrato nº 1 - Suporte mensal - referente a ${ANTERIOR.slice(5)}/${ANTERIOR.slice(0, 4)}\nAtendimento remoto`);
      expect(venda.itens).toEqual([expect.objectContaining({ produtoId: servicoId, precoUnitario: 350 })]);
      expect(venda.contas).toEqual([expect.objectContaining({ valor: 350, dataVencimento: `${ATUAL}-05`, clienteId })]);

      // A descrição da NFS-e leva a referência do contrato (vem das observações da venda).
      const xml = (await api(app, a.token).get(`/notas-servico/${body.notas[0].id}/xml`).expect(200)).text;
      expect(xml).toContain('Contrato nº 1 - Suporte mensal - referente a');

      // De novo, não gera nada; e o mês futuro não pode.
      await gerar(contrato.id, ANTERIOR).expect(200);
      expect(await vendasDoContrato(contrato.id)).toHaveLength(1);
      expect((await gerar(contrato.id, mesSeguinte(ATUAL)).expect(400)).body.message).toMatch(/mês futuro/);
      expect((await gerar(contrato.id, mesSeguinte(ANTERIOR, -1)).expect(400)).body.message).toMatch(/fora da vigência/);
    });

    it('dois pedidos ao mesmo tempo geram uma venda só', async () => {
      const contrato = (await novo().expect(201)).body;
      const respostas = await Promise.all([gerar(contrato.id, ANTERIOR), gerar(contrato.id, ANTERIOR), gerar(contrato.id, ANTERIOR)]);
      expect(respostas.every((r) => [200, 409].includes(r.status))).toBe(true);
      expect(await vendasDoContrato(contrato.id)).toHaveLength(1);
      expect((await mes(ANTERIOR)).itens[0].estado).toBe('CONCLUIDA');
    });

    it('falha numa etapa fica registrada; tentar de novo retoma de onde parou, sem outra venda', async () => {
      // Sem CPF/CNPJ no cliente, a venda é faturada, mas a DPS não sai.
      const semDocumento = (await api(app, a.token).post('/clientes', { nome: 'Ana sem documento' }).expect(201)).body.id;
      const contrato = (await novo({ clienteId: semDocumento, emitirNfse: true }).expect(201)).body;
      const falha = (await gerar(contrato.id, ANTERIOR).expect(200)).body;
      expect(falha).toMatchObject({ estado: 'FALHA', venda: { status: 'FATURADA' } });
      expect(falha.geracao.erro).toMatch(/^Nota de serviço: Informe o CPF\/CNPJ no cadastro do cliente/);

      await api(app, a.token).patch(`/clientes/${semDocumento}`).send({ documento: '52998224725' }).expect(200);
      const certo = (await gerar(contrato.id, ANTERIOR).expect(200)).body;
      expect(certo).toMatchObject({ estado: 'NOTA_PENDENTE', venda: { id: falha.venda.id } });
      expect(await vendasDoContrato(contrato.id)).toHaveLength(1);
    });

    it('venda do mês cancelada: a cobrança pode ser gerada de novo', async () => {
      const contrato = (await novo().expect(201)).body;
      const primeira = (await gerar(contrato.id, ANTERIOR).expect(200)).body;
      await api(app, a.token).post(`/vendas/${primeira.venda.id}/cancelamento`).expect(200);
      expect((await mes(ANTERIOR)).itens[0].estado).toBe('VENDA_CANCELADA');
      const segunda = (await gerar(contrato.id, ANTERIOR).expect(200)).body;
      expect(segunda.estado).toBe('CONCLUIDA');
      expect(segunda.venda.id).not.toBe(primeira.venda.id);
      expect((await vendasDoContrato(contrato.id)).map((v) => v.status)).toEqual(['CANCELADA', 'FATURADA']);
    });

    it('transmite a NFS-e quando pedido; recusa da Sefin fica como pendência na nota', async () => {
      const pfx = sefin.certificadoA1(cnpj);
      await api(app, a.token).put('/empresas/atual/certificado').send({ certificado: pfx.toString('base64'), senha: '1234' }).expect(200);
      const contrato = (await novo({ emitirNfse: true, transmitirNfse: true }).expect(201)).body;
      const emitida = (await gerar(contrato.id, ANTERIOR).expect(200)).body;
      expect(emitida.estado).toBe('CONCLUIDA');
      expect(emitida.notas).toEqual([expect.objectContaining({ status: 'EMITIDA', numeroNfse: expect.any(String) })]);

      sefin.modo = 'recusar';
      const outro = (await novo({ emitirNfse: true, transmitirNfse: true }).expect(201)).body;
      const recusada = (await gerar(outro.id, ANTERIOR).expect(200)).body;
      expect(recusada).toMatchObject({ estado: 'NOTA_PENDENTE', geracao: { situacao: 'CONCLUIDA' } });
      expect(recusada.notas[0].erroTransmissao).toMatch(/^E0312/);
    });

    it('o mês mostra o que falta, e "gerar pendentes" gera todos de uma vez', async () => {
      await novo().expect(201);
      await novo({ itens: [{ produtoId: servicoId, quantidade: 1, precoUnitario: 120 }] }).expect(201);
      const pausado = (await novo().expect(201)).body;
      await api(app, a.token).post(`/contratos/${pausado.id}/pausa`).expect(200);

      const antes = await mes(ANTERIOR);
      // O pausado sem cobrança no mês não aparece.
      expect(antes.itens.map((i: { estado: string }) => i.estado)).toEqual(['A_GERAR', 'A_GERAR']);
      expect(antes.resumo).toMatchObject({ contratos: 2, gerado: 0, aGerar: 470, pendencias: 2 });

      const { body } = await api(app, a.token).post('/contratos/geracoes').send({ competencia: ANTERIOR }).expect(200);
      expect(body).toMatchObject({ geradas: 2, falhas: 0, resumo: { gerado: 470, aGerar: 0, pendencias: 0 } });
    });
  });

  describe('agendador', () => {
    it('gera sozinho quando chega o dia do faturamento, inclusive o mês anterior, sem repetir falhas', async () => {
      const agendador = app.get(AgendadorContratos);
      const cedo = (await novo({ diaFaturamento: 1 }).expect(201)).body;
      const tarde = (await novo({ diaFaturamento: 28 }).expect(201)).body;
      const semDocumento = (await api(app, a.token).post('/clientes', { nome: 'Sem documento' }).expect(201)).body.id;
      const comFalha = (await novo({ clienteId: semDocumento, emitirNfse: true }).expect(201)).body;

      // No dia 1 do mês atual: o mês anterior inteiro e, do atual, só o que fatura no dia 1.
      expect(await agendador.rodar(`${ATUAL}-01`)).toEqual({ geradas: 3, falhas: 2 });
      const estados = async (competencia: string) =>
        Object.fromEntries((await mes(competencia)).itens.map((i: { contrato: { id: string }; estado: string }) => [i.contrato.id, i.estado]));
      expect(await estados(ANTERIOR)).toEqual({ [cedo.id]: 'CONCLUIDA', [tarde.id]: 'CONCLUIDA', [comFalha.id]: 'FALHA' });
      const atual = await estados(ATUAL);
      expect(atual[cedo.id]).toBe('CONCLUIDA');
      expect(atual[comFalha.id]).toBe('FALHA');
      expect((await mes(ATUAL)).itens.find((i: { contrato: { id: string } }) => i.contrato.id === tarde.id).geracao).toBeNull();

      // Rodar de novo não repete o que foi gerado nem insiste nas falhas.
      expect(await agendador.rodar(`${ATUAL}-01`)).toEqual({ geradas: 0, falhas: 0 });
      expect(await vendasDoContrato(cedo.id)).toHaveLength(2);

      // A geração automática fica na auditoria, sem usuário.
      const [registro] = await app
        .get(DataSource)
        .query(`SELECT acao, dados FROM auditoria WHERE recurso_id = $1 AND usuario_id IS NULL ORDER BY criado_em LIMIT 1`, [cedo.id]);
      expect(registro).toMatchObject({ acao: expect.stringContaining('agendador'), dados: expect.objectContaining({ situacao: 'CONCLUIDA' }) });
    });
  });
});

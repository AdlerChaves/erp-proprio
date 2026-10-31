import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { dataHoraComFuso } from '../src/common/datas';
import { AmbienteNfse } from '../src/modules/empresas/empresa.entity';
import { montarDanfse, qrConsulta } from '../src/modules/nfse/danfse';
import { OPCOES_SEFIN } from '../src/modules/nfse/sefin';
import { Perfil } from '../src/modules/usuarios/perfil.enum';
import { Acesso, adicionarUsuario, api, criarApp, limparBanco, registrarEmpresa } from './helpers';
import { SefinFalsa } from './sefin-falsa';

const FISCAL = { inscricaoMunicipal: '12345', codigoMunicipio: '3556503', regimeTributario: 'SIMPLES_NACIONAL', aliquotaSimples: 6 };
const DIA = 86_400_000;

// Gerar chaves RSA e subir a Sefin falsa leva alguns segundos.
jest.setTimeout(30_000);

describe('Emissão da NFS-e no Emissor Nacional', () => {
  let app: INestApplication;
  let sefin: SefinFalsa;
  let a: Acesso;
  let cnpj: string;

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
    sefin.cancelamentos.clear();
    cliente = null;
    a = await registrarEmpresa(app);
    cnpj = (await api(app, a.token).patch('/empresas/atual', FISCAL).expect(200)).body.cnpj;
  });
  afterAll(async () => {
    await app.close();
    sefin.fechar();
  });

  const instalar = (pfx: Buffer, senha = '1234', token = a.token) =>
    api(app, token).put('/empresas/atual/certificado', { certificado: pfx.toString('base64'), senha });

  let sequencia = 0;
  /** O cliente da empresa do teste; o CNPJ não pode se repetir, então as notas do mesmo teste o reaproveitam. */
  let cliente: { id: string } | null = null;
  const notaPendente = async () => {
    const n = ++sequencia;
    cliente ??= (await api(app, a.token).post('/clientes', { nome: `Cliente ${n}`, documento: '11222333000181' }).expect(201)).body;
    const servico = (
      await api(app, a.token)
        .post('/produtos', {
          codigo: `S${n}`,
          descricao: 'Suporte técnico',
          tipo: 'SERVICO',
          unidade: 'H',
          precoVenda: 150,
          codigoServico: '01.07',
          codigoTributacaoNacional: '010701',
        })
        .expect(201)
    ).body;
    const venda = (
      await api(app, a.token)
        .post('/vendas', { clienteId: cliente!.id, status: 'PEDIDO', itens: [{ produtoId: servico.id, quantidade: 2 }], dataEmissao: '2026-10-01' })
        .expect(201)
    ).body;
    await api(app, a.token).post(`/vendas/${venda.id}/faturamento`, { data: '2026-10-05' }).expect(200);
    return (await api(app, a.token).post(`/vendas/${venda.id}/notas-servico`).expect(201)).body[0] as { id: string; numeroDps: number };
  };
  const transmitir = (id: string, token = a.token) => api(app, token).post(`/notas-servico/${id}/transmissao`);
  const posts = () => sefin.recebidas.filter((r) => r.metodo === 'POST');

  describe('certificado digital', () => {
    it('instala o e-CNPJ da empresa sem devolver nem registrar o arquivo', async () => {
      const { body } = await instalar(sefin.certificadoA1(cnpj, { razao: 'EMPRESA TESTE LTDA' })).expect(200);
      expect(body.certificadoTitular).toBe(`EMPRESA TESTE LTDA:${cnpj}`);
      expect(new Date(body.certificadoValidade).getTime()).toBeGreaterThan(Date.now() + 300 * DIA);
      expect(body).not.toHaveProperty('certificadoCifrado');

      const atual = (await api(app, a.token).get('/empresas/atual').expect(200)).body;
      expect(atual).not.toHaveProperty('certificadoCifrado');
      expect(atual.certificadoTitular).toBe(body.certificadoTitular);

      // No banco, só cifrado; na auditoria, nem o arquivo nem a senha.
      const [linha] = await app.get(DataSource).query(`SELECT certificado_cifrado FROM empresas WHERE id = $1`, [a.empresaId]);
      expect(linha.certificado_cifrado).toMatch(/^v1:/);
      expect(linha.certificado_cifrado).not.toContain('1234');
      const registros = await app.get(DataSource).query(`SELECT dados FROM auditoria WHERE empresa_id = $1 AND dados::text LIKE '%certificado%'`, [a.empresaId]);
      expect(registros).toHaveLength(1);
      expect(registros[0].dados).toEqual({ certificado: '***', senha: '***' });
    });

    it('recusa senha errada, arquivo inválido, CNPJ de outra empresa e certificado vencido', async () => {
      const pfx = sefin.certificadoA1(cnpj);
      expect((await instalar(pfx, 'errada').expect(400)).body.message).toBe('A senha do certificado está incorreta');
      expect((await instalar(Buffer.from('não é um pfx')).expect(400)).body.message).toMatch(/não é um certificado A1 válido/);
      expect((await instalar(sefin.certificadoA1('99888777000166')).expect(400)).body.message).toMatch(/CNPJ 99\.888\.777\/0001-66, e a empresa é/);
      const vencido = sefin.certificadoA1(cnpj, { validoDe: new Date(Date.now() - 400 * DIA), validoAte: new Date(Date.now() - DIA) });
      expect((await instalar(vencido).expect(400)).body.message).toMatch(/venceu em/);
      expect((await api(app, a.token).get('/empresas/atual').expect(200)).body.certificadoTitular).toBeNull();
    });

    it('aceita o certificado da matriz numa filial (mesma raiz de CNPJ)', async () => {
      const matriz = `${cnpj.slice(0, 8)}000100`;
      await instalar(sefin.certificadoA1(matriz)).expect(200);
    });

    it('só o administrador instala ou remove; remover limpa tudo', async () => {
      const financeiro = await adicionarUsuario(app, a, Perfil.FINANCEIRO);
      await instalar(sefin.certificadoA1(cnpj), '1234', financeiro.token).expect(403);
      await instalar(sefin.certificadoA1(cnpj)).expect(200);
      await api(app, financeiro.token).delete('/empresas/atual/certificado').expect(403);
      await api(app, a.token).delete('/empresas/atual/certificado').expect(204);
      const { body } = await api(app, a.token).get('/empresas/atual').expect(200);
      expect(body).toMatchObject({ certificadoTitular: null, certificadoValidade: null });
    });
  });

  describe('transmissão', () => {
    it('sem certificado, explica onde instalar', async () => {
      const nota = await notaPendente();
      expect((await transmitir(nota.id).expect(400)).body.message).toMatch(/Instale o certificado digital A1/);
      expect(sefin.recebidas).toHaveLength(0);
    });

    it('assina com o certificado da empresa, envia e guarda a NFS-e', async () => {
      await instalar(sefin.certificadoA1(cnpj)).expect(200);
      const nota = await notaPendente();
      const antes = dataHoraComFuso();
      const { body } = await transmitir(nota.id).expect(200);

      const [gerada] = [...sefin.emitidas.values()];
      expect(body).toMatchObject({ status: 'EMITIDA', chaveAcesso: gerada.chave, erroTransmissao: null });
      expect(body.numeroNfse).toBe(gerada.xml.match(/<nNFSe>(\d+)<\/nNFSe>/)![1]);
      expect(body.chaveAcesso).toMatch(/^\d{50}$/);
      expect(body.dataEmissaoNfse).toBe(antes.slice(0, 10));

      // Uma chamada só, com o certificado da empresa na conexão; a Sefin falsa já conferiu assinatura e esquema.
      expect(sefin.recebidas).toEqual([expect.objectContaining({ metodo: 'POST', rota: '/nfse', cliente: `EMPRESA TESTE LTDA:${cnpj}` })]);
      const enviada = sefin.recebidas[0].dps!;
      expect(enviada).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
      expect(enviada).toContain('<tpAmb>2</tpAmb>');
      // dhEmi é o do envio, com folga para trás por causa da diferença de relógio com a Sefin.
      const dhEmi = enviada.match(/<dhEmi>([^<]+)<\/dhEmi>/)![1];
      expect(dhEmi < antes).toBe(true);
      expect(Date.parse(antes) - Date.parse(dhEmi)).toBeLessThan(120_000);

      // A DPS guardada passa a ser a assinada, e a NFS-e pode ser baixada.
      expect((await api(app, a.token).get(`/notas-servico/${nota.id}/xml`).expect(200)).text).toBe(enviada);
      const nfse = await api(app, a.token).get(`/notas-servico/${nota.id}/xml-nfse`).expect(200);
      expect(nfse.headers['content-disposition']).toContain(`NFSe-${body.chaveAcesso}.xml`);
      expect(nfse.text).toContain(`<infNFSe Id="NFS${body.chaveAcesso}">`);

      expect((await transmitir(nota.id).expect(400)).body.message).toMatch(/está emitida/);
      expect(posts()).toHaveLength(1);
    });

    it('recusa da Sefin: a nota continua a emitir, com o motivo, e pode ser reenviada', async () => {
      await instalar(sefin.certificadoA1(cnpj)).expect(200);
      const nota = await notaPendente();
      sefin.modo = 'recusar';
      const recusa = await transmitir(nota.id).expect(400);
      expect(recusa.body.message).toBe('O Emissor Nacional recusou a nota: E0312 - Código de tributação nacional inexistente (010701)');
      const pendente = (await api(app, a.token).get(`/notas-servico/${nota.id}`).expect(200)).body;
      expect(pendente).toMatchObject({ status: 'PENDENTE', erroTransmissao: 'E0312 - Código de tributação nacional inexistente (010701)' });
      expect(await api(app, a.token).get(`/notas-servico/${nota.id}/xml`).then((r) => r.text)).not.toContain('<Signature');

      sefin.modo = 'emitir';
      const { body } = await transmitir(nota.id).expect(200);
      expect(body).toMatchObject({ status: 'EMITIDA', erroTransmissao: null });
    });

    it('resposta perdida: no reenvio, recupera a nota já gerada em vez de emitir de novo', async () => {
      await instalar(sefin.certificadoA1(cnpj)).expect(200);
      const nota = await notaPendente();
      sefin.modo = 'perder-resposta';
      const falha = await transmitir(nota.id).expect(502);
      expect(falha.body.message).toMatch(/Não foi possível falar com a Sefin Nacional.*Tente de novo/);
      expect(sefin.emitidas.size).toBe(1);

      sefin.modo = 'emitir';
      const { body } = await transmitir(nota.id).expect(200);
      const [gerada] = [...sefin.emitidas.values()];
      const numero = gerada.xml.match(/<nNFSe>(\d+)<\/nNFSe>/)![1];
      expect(body).toMatchObject({ status: 'EMITIDA', chaveAcesso: gerada.chave, numeroNfse: numero });
      expect(posts()).toHaveLength(1);
      expect(sefin.recebidas.map((r) => `${r.metodo} ${r.rota.replace(/\w{40,}/, '…')}`)).toEqual(['POST /nfse', 'GET /dps/…', 'GET /nfse/…']);
    });

    it('dois envios ao mesmo tempo emitem uma nota só', async () => {
      await instalar(sefin.certificadoA1(cnpj)).expect(200);
      const nota = await notaPendente();
      const respostas = await Promise.all([transmitir(nota.id), transmitir(nota.id)]);
      expect(respostas.map((r) => r.status).sort()).toEqual([200, 400]);
      expect(posts()).toHaveLength(1);
    });

    it('vendas e consulta não transmitem; outra empresa não vê a NFS-e', async () => {
      await instalar(sefin.certificadoA1(cnpj)).expect(200);
      const nota = await notaPendente();
      for (const perfil of [Perfil.VENDAS, Perfil.CONSULTA]) {
        await transmitir(nota.id, (await adicionarUsuario(app, a, perfil)).token).expect(403);
      }
      await api(app, a.token).get(`/notas-servico/${nota.id}/xml-nfse`).expect(404);
      await transmitir(nota.id).expect(200);
      const b = await registrarEmpresa(app);
      await transmitir(nota.id, b.token).expect(404);
      await api(app, b.token).get(`/notas-servico/${nota.id}/xml-nfse`).expect(404);
    });
  });

  /** Nota transmitida e emitida pela Sefin falsa. */
  const notaEmitida = async () => {
    await instalar(sefin.certificadoA1(cnpj)).expect(200);
    const nota = await notaPendente();
    return (await transmitir(nota.id).expect(200)).body as { id: string; chaveAcesso: string; numeroNfse: string };
  };
  const cancelar = (id: string, corpo: object, token = a.token) => api(app, token).post(`/notas-servico/${id}/cancelamento`).send(corpo);
  const rotas = () => sefin.recebidas.map((r) => `${r.metodo} ${r.rota.replace(/\d{50}/, '{chave}')}`);
  const MOTIVO = 'Valor do serviço informado errado';

  describe('cancelamento no Emissor Nacional', () => {
    it('cancela a nota emitida pelo ERP por evento assinado e guarda o XML do evento', async () => {
      const nota = await notaEmitida();
      const antes = dataHoraComFuso();
      const { body } = await cancelar(nota.id, { motivo: MOTIVO, codigoMotivo: 1 }).expect(200);
      expect(body).toMatchObject({ status: 'CANCELADA', motivoCancelamento: MOTIVO, emitidaNoErp: true });

      // Pedido válido no esquema e assinado com o certificado da empresa (a Sefin falsa conferiu os dois).
      expect(rotas()).toEqual(['POST /nfse', 'POST /nfse/{chave}/eventos']);
      const pedido = sefin.recebidas[1].pedidoEvento!;
      expect(sefin.recebidas[1].cliente).toBe(`EMPRESA TESTE LTDA:${cnpj}`);
      expect(pedido).toContain(`<infPedReg Id="PRE${nota.chaveAcesso}101101">`);
      expect(pedido).toContain(`<CNPJAutor>${cnpj}</CNPJAutor>`);
      expect(pedido).toContain('<tpAmb>2</tpAmb>');
      expect(pedido).toContain(`<e101101><xDesc>Cancelamento de NFS-e</xDesc><cMotivo>1</cMotivo><xMotivo>${MOTIVO}</xMotivo></e101101>`);
      // dhEvento recuado, porque a Sefin recusa pedido "no futuro" (E1843).
      const dhEvento = pedido.match(/<dhEvento>([^<]+)<\/dhEvento>/)![1];
      expect(dhEvento < antes).toBe(true);

      const xml = await api(app, a.token).get(`/notas-servico/${nota.id}/xml-cancelamento`).expect(200);
      expect(xml.headers['content-disposition']).toContain(`Cancelamento-NFSe-${nota.chaveAcesso}.xml`);
      expect(xml.text).toBe(sefin.cancelamentos.get(nota.chaveAcesso));
      expect(xml.text).toContain('<evento ');

      expect((await cancelar(nota.id, { motivo: MOTIVO, codigoMotivo: 1 }).expect(400)).body.message).toBe('A nota já está cancelada');
      expect(sefin.cancelamentos.size).toBe(1);
    });

    it('exige o código do motivo e 15 caracteres de descrição, sem chamar a Sefin', async () => {
      const nota = await notaEmitida();
      expect((await cancelar(nota.id, { motivo: MOTIVO }).expect(400)).body.message).toMatch(/Informe o motivo do cancelamento/);
      expect((await cancelar(nota.id, { motivo: 'Valor errado', codigoMotivo: 9 }).expect(400)).body.message).toMatch(/pelo menos 15 caracteres/);
      await cancelar(nota.id, { motivo: MOTIVO, codigoMotivo: 3 }).expect(400);
      await cancelar(nota.id, { motivo: MOTIVO, codigoMotivo: 'OUTROS' }).expect(400);
      expect(rotas()).toEqual(['POST /nfse']);
      expect((await api(app, a.token).get(`/notas-servico/${nota.id}`).expect(200)).body.status).toBe('EMITIDA');
    });

    it('recusa da Sefin: a nota continua emitida e a mensagem traz o código do erro', async () => {
      const nota = await notaEmitida();
      sefin.modo = 'recusar';
      const { body } = await cancelar(nota.id, { motivo: MOTIVO, codigoMotivo: 9 }).expect(400);
      expect(body.message).toBe(
        'O Emissor Nacional recusou o cancelamento: E0822 - O prazo para o cancelamento da NFS-e expirou, conforme parametrização do município emissor da NFS-e',
      );
      expect((await api(app, a.token).get(`/notas-servico/${nota.id}`).expect(200)).body).toMatchObject({ status: 'EMITIDA', motivoCancelamento: null });
      await api(app, a.token).get(`/notas-servico/${nota.id}/xml-cancelamento`).expect(404);
    });

    it('resposta perdida: na nova tentativa, reconhece o cancelamento já registrado em vez de falhar', async () => {
      const nota = await notaEmitida();
      sefin.modo = 'perder-resposta';
      const falha = await cancelar(nota.id, { motivo: MOTIVO, codigoMotivo: 2 }).expect(502);
      expect(falha.body.message).toMatch(/Não foi possível falar com a Sefin Nacional.*continua emitida no ERP/);
      expect((await api(app, a.token).get(`/notas-servico/${nota.id}`).expect(200)).body.status).toBe('EMITIDA');

      sefin.modo = 'emitir';
      const { body } = await cancelar(nota.id, { motivo: 'Outro texto digitado na nova tentativa', codigoMotivo: 9 }).expect(200);
      // Vale o motivo do evento que a Sefin registrou, não o da segunda tentativa.
      expect(body).toMatchObject({ status: 'CANCELADA', motivoCancelamento: MOTIVO });
      expect(rotas()).toEqual(['POST /nfse', 'POST /nfse/{chave}/eventos', 'POST /nfse/{chave}/eventos', 'GET /nfse/{chave}/eventos/101101/1']);
      expect(sefin.cancelamentos.size).toBe(1);
    });

    it('nota emitida fora do ERP e nota pendente: cancela só no ERP, sem falar com a Sefin', async () => {
      await instalar(sefin.certificadoA1(cnpj)).expect(200);
      const fora = await notaPendente();
      await api(app, a.token).post(`/notas-servico/${fora.id}/emissao`, { numeroNfse: '77', dataEmissao: '2026-10-06' }).expect(200);
      const { body } = await cancelar(fora.id, { motivo: 'Cancelada no portal' }).expect(200);
      expect(body).toMatchObject({ status: 'CANCELADA', emitidaNoErp: false });

      const pendente = await notaPendente();
      await cancelar(pendente.id, { motivo: 'Gerada por engano' }).expect(200);
      expect(sefin.recebidas).toHaveLength(0);
    });

    it('vendas e consulta não cancelam; outra empresa não vê o cancelamento', async () => {
      const nota = await notaEmitida();
      for (const perfil of [Perfil.VENDAS, Perfil.CONSULTA]) {
        await cancelar(nota.id, { motivo: MOTIVO, codigoMotivo: 1 }, (await adicionarUsuario(app, a, perfil)).token).expect(403);
      }
      const b = await registrarEmpresa(app);
      await cancelar(nota.id, { motivo: MOTIVO, codigoMotivo: 1 }, b.token).expect(404);
      await cancelar(nota.id, { motivo: MOTIVO, codigoMotivo: 1 }).expect(200);
      await api(app, b.token).get(`/notas-servico/${nota.id}/xml-cancelamento`).expect(404);
      expect(sefin.cancelamentos.size).toBe(1);
    });
  });

  describe('DANFSe', () => {
    /** Todos os textos e QR Codes do layout, para conferir o conteúdo sem ler o PDF. */
    const textos = (no: unknown): string[] => {
      if (Array.isArray(no)) return no.flatMap(textos);
      if (!no || typeof no !== 'object') return [];
      return Object.entries(no).flatMap(([k, v]) => ((k === 'text' || k === 'qr') && typeof v === 'string' ? [v] : textos(v)));
    };
    const pdf = (id: string, token = a.token) =>
      api(app, token)
        .get(`/notas-servico/${id}/danfse`)
        .buffer(true)
        .parse((res, fim) => {
          const partes: Buffer[] = [];
          res.on('data', (p: Buffer) => partes.push(p));
          res.on('end', () => fim(null, Buffer.concat(partes)));
        });

    it('gera o PDF da NFS-e emitida pelo ERP a partir do XML devolvido pela Sefin', async () => {
      const nota = await notaEmitida();
      const res = await pdf(nota.id).expect(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toBe(`inline; filename="DANFSe-${nota.numeroNfse}.pdf"`);
      expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

      const xml = (await api(app, a.token).get(`/notas-servico/${nota.id}/xml-nfse`).expect(200)).text;
      const layout = montarDanfse(xml, { cancelada: false });
      const t = textos(layout.content);
      expect(t).toContain(qrConsulta(nota.chaveAcesso));
      expect(t).toContain(nota.chaveAcesso.replace(/(\d{4})(?=\d)/g, '$1 '));
      expect(t).toContain(nota.numeroNfse);
      expect(t).toContain('EMPRESA TESTE LTDA');
      expect(t).toContain(`CNPJ ${cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}`);
      expect(t).toContain('CNPJ 11.222.333/0001-81');
      expect(t).toContain('05/10/2026');
      expect(t).toContain('Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)');
      expect(t.some((x) => x.startsWith('010701 - '))).toBe(true);
      expect(t).toContain('Simples Nacional: 6% do valor do serviço');
      expect(t).toContain('R$ 300,00');
      expect(t).toContain('AMBIENTE DE HOMOLOGAÇÃO (PRODUÇÃO RESTRITA) - SEM VALOR FISCAL');
      expect(layout.watermark).toMatchObject({ text: 'SEM VALOR FISCAL' });
      expect(montarDanfse(xml, { cancelada: true }).watermark).toMatchObject({ text: 'CANCELADA' });
    });

    it('nota cancelada continua com DANFSe; nota sem XML da NFS-e e outra empresa não têm', async () => {
      const nota = await notaEmitida();
      await cancelar(nota.id, { motivo: MOTIVO, codigoMotivo: 1 }).expect(200);
      expect(((await pdf(nota.id).expect(200)).body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

      const pendente = await notaPendente();
      expect((await api(app, a.token).get(`/notas-servico/${pendente.id}/danfse`).expect(404)).body.message).toMatch(/não foi emitida pelo ERP/);
      const b = await registrarEmpresa(app);
      await api(app, b.token).get(`/notas-servico/${nota.id}/danfse`).expect(404);
    });
  });
});

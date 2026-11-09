import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Perfil } from '../src/modules/usuarios/perfil.enum';
import {
  Acesso,
  adicionarUsuario,
  api,
  criarApp,
  criarCliente,
  criarConta,
  criarFornecedor,
  limparBanco,
  registrarEmpresa,
} from './helpers';

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(2048, 0x20), Buffer.from('\n%%EOF')]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const XML = Buffer.from('﻿<?xml version="1.0" encoding="UTF-8"?><nfeProc><NFe/></nfeProc>');
// Executável do Windows ("MZ") com nome de PDF.
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(512, 0x90)]);

describe('Anexos de contas a pagar e a receber', () => {
  let app: INestApplication;
  let a: Acesso;
  let pagarId: string;
  let receberId: string;

  beforeAll(async () => {
    app = await criarApp();
  });
  beforeEach(async () => {
    await limparBanco(app);
    a = await registrarEmpresa(app);
    const fornecedor = await criarFornecedor(app, a.token);
    const pagar = await api(app, a.token)
      .post('/contas-pagar', { fornecedorId: fornecedor.id, descricao: 'Aluguel', valor: 2500, dataVencimento: '2099-01-05' })
      .expect(201);
    pagarId = pagar.body.id;
    receberId = (await criarConta(app, a.token, (await criarCliente(app, a.token)).id)).id;
  });
  afterAll(() => app.close());

  const enviar = (rota: string, conteudo: Buffer, nome: string, token = a.token) =>
    request(app.getHttpServer())
      .post(`/api${rota}/anexos`)
      .set('Authorization', `Bearer ${token}`)
      .attach('arquivo', conteudo, nome);

  const baixar = (rota: string, anexoId: string, token = a.token) =>
    request(app.getHttpServer())
      .get(`/api${rota}/anexos/${anexoId}`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, fim) => {
        const partes: Buffer[] = [];
        res.on('data', (p: Buffer) => partes.push(p));
        res.on('end', () => fim(null, Buffer.concat(partes)));
      });

  describe.each([
    ['contas a pagar', () => `/contas-pagar/${pagarId}`],
    ['contas a receber', () => `/contas-receber/${receberId}`],
  ])('%s', (_, rota) => {
    it('envia, lista, baixa os mesmos bytes e exclui', async () => {
      const { body: anexo } = await enviar(rota(), PDF, 'boleto-janeiro.pdf').expect(201);
      expect(anexo).toMatchObject({ nome: 'boleto-janeiro.pdf', tipo: 'application/pdf', tamanho: PDF.length });
      expect(anexo).not.toHaveProperty('conteudo');
      expect(anexo.enviadoPor).toMatchObject({ id: a.usuarioId });

      const { body: lista } = await api(app, a.token).get(`${rota()}/anexos`).expect(200);
      expect(lista).toEqual([expect.objectContaining({ id: anexo.id, nome: 'boleto-janeiro.pdf' })]);
      expect(lista[0]).not.toHaveProperty('conteudo');

      const download = await baixar(rota(), anexo.id).expect(200);
      expect(download.headers['content-type']).toBe('application/pdf');
      expect(download.headers['content-disposition']).toContain('attachment');
      expect(download.headers['content-disposition']).toContain('filename="boleto-janeiro.pdf"');
      expect(download.headers['x-content-type-options']).toBe('nosniff');
      expect(Buffer.compare(download.body as Buffer, PDF)).toBe(0);

      await api(app, a.token).delete(`${rota()}/anexos/${anexo.id}`).expect(200);
      expect((await api(app, a.token).get(`${rota()}/anexos`).expect(200)).body).toEqual([]);
      await baixar(rota(), anexo.id).expect(404);
    });

    it('aceita PNG e XML de nota fiscal', async () => {
      await enviar(rota(), PNG, 'comprovante.png').expect(201);
      const { body } = await enviar(rota(), XML, 'nfe.xml').expect(201);
      expect(body.tipo).toBe('application/xml');
    });

    it('recusa arquivo cujo conteúdo não é PDF, imagem ou XML, mesmo com extensão .pdf', async () => {
      const res = await enviar(rota(), EXE, 'boleto.pdf').expect(400);
      expect(res.body.message).toMatch(/PDF, PNG, JPEG ou XML/);
    });

    it('recusa HTML e SVG disfarçados de XML', async () => {
      for (const texto of ['<html><script>alert(1)</script></html>', '<svg onload="alert(1)"/>', '<?xml version="1.0"?><!DOCTYPE html><html/>']) {
        const res = await enviar(rota(), Buffer.from(texto), 'nfe.xml').expect(400);
        expect(res.body.message).toMatch(/PDF, PNG, JPEG ou XML/);
      }
    });

    it('recusa campos extras no multipart (só o arquivo é aceito)', async () => {
      await request(app.getHttpServer())
        .post(`/api${rota()}/anexos`)
        .set('Authorization', `Bearer ${a.token}`)
        .field('extra', 'x'.repeat(100))
        .attach('arquivo', PDF, 'nf.pdf')
        .expect(400);
    });

    it('recusa arquivo acima de 10 MB', async () => {
      const grande = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(10 * 1024 * 1024)]);
      const res = await enviar(rota(), grande, 'grande.pdf').expect(413);
      expect(res.body.message).toMatch(/até 10 MB/);
    });

    it('recusa requisição sem arquivo', async () => {
      await request(app.getHttpServer())
        .post(`/api${rota()}/anexos`)
        .set('Authorization', `Bearer ${a.token}`)
        .field('outro', 'x')
        .expect(400);
    });

    it('limita a 20 anexos por conta', async () => {
      for (let i = 0; i < 20; i++) await enviar(rota(), PNG, `foto-${i}.png`).expect(201);
      const res = await enviar(rota(), PNG, 'excedente.png').expect(400);
      expect(res.body.message).toMatch(/20 anexos/);
    });

    it('limpa o nome: sem caminho, sem caracteres de controle, com a extensão do tipo real', async () => {
      const { body } = await enviar(rota(), PDF, '../../etc/passwd\t').expect(201);
      expect(body.nome).toBe('passwd.pdf');
      const windows = await enviar(rota(), PDF, 'C:\\Users\\x\\"boleto".exe').expect(201);
      expect(windows.body.nome).toBe('boleto.exe.pdf');
      // Caracteres de controle no cabeçalho são barrados já pelo leitor do multipart.
      await enviar(rota(), PDF, 'nota\u0007.pdf').expect(400);
      // Invisíveis (zero-width, BOM) somem; nome só com extensão vira "arquivo".
      expect((await enviar(rota(), PDF, 'bo​leto﻿.pdf').expect(201)).body.nome).toBe('boleto.pdf');
      expect((await enviar(rota(), PDF, '.pdf').expect(201)).body.nome).toBe('arquivo.pdf');
    });

    it('mantém acentos no nome e os devolve no download', async () => {
      const { body } = await enviar(rota(), PDF, 'Nota fiscal março ção.pdf').expect(201);
      expect(body.nome).toBe('Nota fiscal março ção.pdf');
      const download = await baixar(rota(), body.id).expect(200);
      expect(download.headers['content-disposition']).toContain(`filename*=UTF-8''${encodeURIComponent('Nota fiscal março ção.pdf')}`);
    });

    it('conta inexistente responde 404', async () => {
      const outra = rota().replace(/[0-9a-f-]{36}$/, '00000000-0000-4000-8000-000000000000');
      await enviar(outra, PDF, 'x.pdf').expect(404);
      await api(app, a.token).get(`${outra}/anexos`).expect(404);
    });

    it('perfil de consulta lista e baixa, mas não envia nem exclui', async () => {
      const { body: anexo } = await enviar(rota(), PDF, 'nf.pdf').expect(201);
      const consulta = await adicionarUsuario(app, a, Perfil.CONSULTA);
      await api(app, consulta.token).get(`${rota()}/anexos`).expect(200);
      await baixar(rota(), anexo.id, consulta.token).expect(200);
      await enviar(rota(), PDF, 'nf2.pdf', consulta.token).expect(403);
      await api(app, consulta.token).delete(`${rota()}/anexos/${anexo.id}`).expect(403);
    });

    it('outra empresa não vê, não baixa, não envia e não exclui', async () => {
      const { body: anexo } = await enviar(rota(), PDF, 'nf.pdf').expect(201);
      const b = await registrarEmpresa(app);
      await api(app, b.token).get(`${rota()}/anexos`).expect(404);
      await baixar(rota(), anexo.id, b.token).expect(404);
      await enviar(rota(), PDF, 'invasor.pdf', b.token).expect(404);
      await api(app, b.token).delete(`${rota()}/anexos/${anexo.id}`).expect(404);
      expect((await api(app, a.token).get(`${rota()}/anexos`).expect(200)).body).toHaveLength(1);
    });

    it('anexo pode ser enviado com a conta cancelada', async () => {
      await api(app, a.token).post(`${rota()}/cancelamento`).expect(201);
      await enviar(rota(), PDF, 'nf.pdf').expect(201);
    });
  });

  it('anexo de uma conta não é acessível pela rota de outra conta', async () => {
    const { body: anexo } = await enviar(`/contas-pagar/${pagarId}`, PDF, 'boleto.pdf').expect(201);
    await baixar(`/contas-receber/${receberId}`, anexo.id).expect(404);
    await api(app, a.token).delete(`/contas-receber/${receberId}/anexos/${anexo.id}`).expect(404);
    expect((await api(app, a.token).get(`/contas-receber/${receberId}/anexos`).expect(200)).body).toEqual([]);
  });

  it('a listagem de contas informa a quantidade de anexos', async () => {
    await enviar(`/contas-pagar/${pagarId}`, PDF, 'boleto.pdf').expect(201);
    await enviar(`/contas-pagar/${pagarId}`, PNG, 'comprovante.png').expect(201);
    const { body: pagar } = await api(app, a.token).get('/contas-pagar').expect(200);
    expect(pagar.find((c: { id: string }) => c.id === pagarId).quantidadeAnexos).toBe(2);
    const { body: receber } = await api(app, a.token).get('/contas-receber').expect(200);
    expect(receber.find((c: { id: string }) => c.id === receberId).quantidadeAnexos).toBe(0);
  });

  it('a auditoria registra o envio e a exclusão sem guardar o arquivo', async () => {
    const { body: anexo } = await enviar(`/contas-pagar/${pagarId}`, PDF, 'boleto.pdf').expect(201);
    await api(app, a.token).delete(`/contas-pagar/${pagarId}/anexos/${anexo.id}`).expect(200);
    const { body } = await api(app, a.token).get(`/auditoria?recursoId=${pagarId}`).expect(200);
    const acoes = body.itens.map((r: { acao: string }) => r.acao);
    expect(acoes).toEqual(expect.arrayContaining(['POST /api/contas-pagar/:id/anexos', 'DELETE /api/contas-pagar/:id/anexos/:anexoId']));
    expect(JSON.stringify(body.itens)).not.toContain('%PDF');
  });
});

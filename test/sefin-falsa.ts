import { generateKeyPairSync } from 'node:crypto';
import { once } from 'node:events';
import { createServer, Server } from 'node:https';
import { AddressInfo } from 'node:net';
import type { TLSSocket } from 'node:tls';
import { gunzipSync, gzipSync } from 'node:zlib';
import forge from 'node-forge';
import { SignedXml } from 'xml-crypto';
import { dataHoraComFuso } from '../src/common/datas';
import { municipio, servicoNacional } from '../src/modules/nfse/catalogos';
import { validarDps } from '../src/modules/nfse/dps';
import { validarXml } from '../src/modules/nfse/esquemas';
import { validarPedidoEvento } from '../src/modules/nfse/evento';

/**
 * Sefin Nacional de mentira para os testes: HTTPS com certificado de cliente obrigatório (mTLS), emitido por uma
 * autoridade própria, e as rotas que o ERP usa. Confere a assinatura e o esquema de toda DPS e de todo pedido de
 * evento recebidos, e devolve NFS-e completas, assinadas e válidas no esquema oficial.
 */

const chaves = () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privada = forge.pki.privateKeyFromPem(privateKey.export({ type: 'pkcs1', format: 'pem' }) as string);
  return { privada, publica: forge.pki.setRsaPublicKey(privada.n, privada.e) };
};

let serial = 1;
function certificado(opcoes: {
  cn: string;
  publica: forge.pki.rsa.PublicKey;
  emissor?: forge.pki.Certificate;
  chaveEmissor: forge.pki.rsa.PrivateKey;
  ca?: boolean;
  validoDe?: Date;
  validoAte?: Date;
  dns?: string;
}) {
  const cert = forge.pki.createCertificate();
  cert.publicKey = opcoes.publica;
  cert.serialNumber = (serial++).toString(16).padStart(2, '0');
  cert.validity.notBefore = opcoes.validoDe ?? new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = opcoes.validoAte ?? new Date(Date.now() + 365 * 86_400_000);
  const nome = [{ name: 'countryName', value: 'BR' }, { name: 'organizationName', value: 'ICP-Brasil' }, { name: 'commonName', value: opcoes.cn }];
  cert.setSubject(nome);
  cert.setIssuer(opcoes.emissor?.subject.attributes ?? nome);
  cert.setExtensions([
    { name: 'basicConstraints', cA: !!opcoes.ca },
    ...(opcoes.dns ? [{ name: 'subjectAltName', altNames: [{ type: 2, value: opcoes.dns }, { type: 7, ip: '127.0.0.1' }] }] : []),
  ]);
  cert.sign(opcoes.chaveEmissor, forge.md.sha256.create());
  return cert;
}

export type ModoSefin = 'emitir' | 'recusar' | 'perder-resposta';

export interface Recebida {
  metodo: string;
  rota: string;
  /** Nome comum do certificado que o cliente apresentou. */
  cliente: string;
  dps?: string;
  pedidoEvento?: string;
}

export class SefinFalsa {
  modo: ModoSefin = 'emitir';
  readonly recebidas: Recebida[] = [];
  /** NFS-e geradas, pelo Id da DPS. */
  readonly emitidas = new Map<string, { chave: string; xml: string }>();
  /** Eventos de cancelamento registrados, pela chave da NFS-e. */
  readonly cancelamentos = new Map<string, string>();
  url = '';
  private servidor: Server;
  private readonly ca = chaves();
  private readonly certificadoCa = certificado({ cn: 'AC Teste', publica: this.ca.publica, chaveEmissor: this.ca.privada, ca: true });
  private numero = 0;
  private chaveServidor: { privada: string; certificado: string };

  get caPem() {
    return forge.pki.certificateToPem(this.certificadoCa);
  }

  async iniciar() {
    const servidor = chaves();
    const cert = certificado({
      cn: 'localhost',
      publica: servidor.publica,
      emissor: this.certificadoCa,
      chaveEmissor: this.ca.privada,
      dns: 'localhost',
    });
    this.chaveServidor = { privada: forge.pki.privateKeyToPem(servidor.privada), certificado: forge.pki.certificateToPem(cert) };
    this.servidor = createServer(
      {
        key: forge.pki.privateKeyToPem(servidor.privada),
        cert: forge.pki.certificateToPem(cert),
        ca: [this.caPem],
        requestCert: true,
        rejectUnauthorized: true,
      },
      (req, res) => {
        const partes: Buffer[] = [];
        req.on('data', (p: Buffer) => partes.push(p));
        req.on('end', () => {
          this.atender(req.method!, req.url!, Buffer.concat(partes).toString('utf8'), (req.socket as TLSSocket), (status, corpo) => {
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(corpo));
          }).catch((e: Error) => {
            res.writeHead(500);
            res.end(e.message);
          });
        });
      },
    );
    this.servidor.listen(0, '127.0.0.1');
    await once(this.servidor, 'listening');
    this.url = `https://localhost:${(this.servidor.address() as AddressInfo).port}/SefinNacional`;
    return this;
  }

  fechar() {
    this.servidor.closeAllConnections();
    this.servidor.close();
  }

  /** Certificado A1 (.pfx) como a ICP-Brasil emite para empresas: "RAZÃO SOCIAL:CNPJ" no nome comum. */
  certificadoA1(cnpj: string, opcoes: { senha?: string; validoDe?: Date; validoAte?: Date; razao?: string } = {}) {
    const cliente = chaves();
    const cert = certificado({
      cn: `${opcoes.razao ?? 'EMPRESA TESTE LTDA'}:${cnpj}`,
      publica: cliente.publica,
      emissor: this.certificadoCa,
      chaveEmissor: this.ca.privada,
      validoDe: opcoes.validoDe,
      validoAte: opcoes.validoAte,
    });
    const p12 = forge.pkcs12.toPkcs12Asn1(cliente.privada, [cert, this.certificadoCa], opcoes.senha ?? '1234', { algorithm: '3des' });
    return Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary');
  }

  private async atender(
    metodo: string,
    url: string,
    corpo: string,
    socket: TLSSocket,
    responder: (status: number, corpo: object) => void,
  ) {
    const rota = url.replace(/^\/SefinNacional/, '');
    const recebida: Recebida = { metodo, rota, cliente: String(socket.getPeerCertificate().subject?.CN ?? '') };
    this.recebidas.push(recebida);

    if (metodo === 'POST' && rota === '/nfse') {
      const dps = gunzipSync(Buffer.from(JSON.parse(corpo).dpsXmlGZipB64, 'base64')).toString('utf8');
      recebida.dps = dps;
      const problemas = [...(await validarDps(dps)), ...this.conferirAssinatura(dps, socket)];
      if (problemas.length) return responder(400, { erros: [{ Codigo: 'E1235', Descricao: problemas.join('; ') }] });
      if (this.modo === 'recusar') {
        return responder(400, { erros: [{ Codigo: 'E0312', Descricao: 'Código de tributação nacional inexistente', Complemento: '010701' }] });
      }
      const id = dps.match(/<infDPS Id="([^"]+)"/)![1];
      if (this.emitidas.has(id)) return responder(400, { erros: [{ Codigo: 'E0014', Descricao: 'DPS já utilizada para gerar NFS-e' }] });
      const nota = await this.gerarNfse(id, dps, recebida.cliente);
      this.emitidas.set(id, nota);
      // Gera a nota, mas a resposta se perde no caminho.
      if (this.modo === 'perder-resposta') return void socket.destroy();
      return responder(201, {
        tipoAmbiente: 2,
        idDps: id,
        chaveAcesso: nota.chave,
        nfseXmlGZipB64: gzipSync(Buffer.from(nota.xml)).toString('base64'),
        alertas: [],
      });
    }
    const dps = rota.match(/^\/dps\/(\w+)$/);
    if (metodo === 'GET' && dps) {
      const nota = this.emitidas.get(dps[1]);
      return nota
        ? responder(200, { idDps: dps[1], chaveAcesso: nota.chave })
        : responder(404, { erro: { codigo: 'E2404', descricao: 'Não foi gerada uma NFS-e com o identificador de DPS informado' } });
    }
    const eventos = rota.match(/^\/nfse\/(\d{50})\/eventos$/);
    if (metodo === 'POST' && eventos) return this.registrarEvento(eventos[1], corpo, socket, recebida, responder);
    const cancelamento = rota.match(/^\/nfse\/(\d{50})\/eventos\/101101\/1$/);
    if (metodo === 'GET' && cancelamento) {
      const evento = this.cancelamentos.get(cancelamento[1]);
      if (!evento) return responder(404, { erro: { codigo: 'E2404', descricao: 'Evento não encontrado' } });
      // O manual não descreve esta resposta; o ERP procura o XML em qualquer campo "eventoXmlGZipB64".
      return responder(200, { eventos: [{ chaveAcesso: cancelamento[1], tipoEvento: '101101', eventoXmlGZipB64: gzipSync(Buffer.from(evento)).toString('base64') }] });
    }
    const nfse = rota.match(/^\/nfse\/(\d{50})$/);
    if (metodo === 'GET' && nfse) {
      const nota = [...this.emitidas.values()].find((n) => n.chave === nfse[1]);
      if (!nota) return responder(404, { erro: { codigo: 'E2400', descricao: 'NFS-e não encontrada' } });
      return responder(200, { chaveAcesso: nota.chave, nfseXmlGZipB64: gzipSync(Buffer.from(nota.xml)).toString('base64') });
    }
    responder(404, { erro: { codigo: 'E404', descricao: `Rota desconhecida: ${metodo} ${rota}` } });
  }

  /** POST /nfse/{chave}/eventos: só o cancelamento (101101) pelo prestador, com as regras do Anexo II que o ERP pode violar. */
  private async registrarEvento(
    chave: string,
    corpo: string,
    socket: TLSSocket,
    recebida: Recebida,
    responder: (status: number, corpo: object) => void,
  ) {
    const pedido = gunzipSync(Buffer.from(JSON.parse(corpo).pedidoRegistroEventoXmlGZipB64, 'base64')).toString('utf8');
    recebida.pedidoEvento = pedido;
    const problemas = [...(await validarPedidoEvento(pedido)), ...this.conferirAssinatura(pedido, socket)];
    if (problemas.length) return responder(400, { erros: [{ Codigo: 'E1235', Descricao: problemas.join('; ') }] });
    const nota = [...this.emitidas.values()].find((n) => n.chave === chave);
    if (!nota) return responder(400, { erros: [{ Codigo: 'E1831', Descricao: 'A NFS-e indicada não existe no Ambiente de Dados Nacional NFS-e' }] });
    if (!pedido.includes(`<infPedReg Id="PRE${chave}101101">`) || !pedido.includes(`<chNFSe>${chave}</chNFSe>`)) {
      return responder(400, { erros: [{ Codigo: 'E1827', Descricao: 'Identificador do pedido de registro de evento inválido' }] });
    }
    const autor = pedido.match(/<CNPJAutor>(\d{14})<\/CNPJAutor>/)?.[1];
    if (autor?.slice(0, 8) !== recebida.cliente.split(':')[1]?.slice(0, 8)) {
      return responder(400, { erros: [{ Codigo: 'E0812', Descricao: 'O CNPJ do autor não corresponde ao do certificado' }] });
    }
    if (this.cancelamentos.has(chave)) {
      return responder(400, { erros: [{ Codigo: 'E0840', Descricao: 'O evento de Cancelamento de NFS-e já está vinculado à NFS-e indicada' }] });
    }
    if (this.modo === 'recusar') {
      return responder(400, { erros: [{ Codigo: 'E0822', Descricao: 'O prazo para o cancelamento da NFS-e expirou, conforme parametrização do município emissor da NFS-e' }] });
    }
    const id = `EVT${pedido.match(/<infPedReg Id="PRE(\d{56})">/)![1]}001`;
    const evento = this.assinar(
      '<?xml version="1.0" encoding="UTF-8"?>' +
        `<evento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infEvento Id="${id}">` +
        `<verAplic>SefinNac_Teste</verAplic><ambGer>2</ambGer><nSeqEvento>1</nSeqEvento><dhProc>${dataHoraComFuso()}</dhProc>` +
        `<nDFSe>${++this.numero}</nDFSe>${pedido.replace(/^<\?xml[^>]*>/, '')}</infEvento></evento>`,
      'infEvento',
    );
    this.cancelamentos.set(chave, evento);
    if (this.modo === 'perder-resposta') return void socket.destroy();
    responder(201, { tipoAmbiente: 2, versaoAplicativo: 'SefinNac_Teste', dataHoraProcessamento: dataHoraComFuso(), eventoXmlGZipB64: gzipSync(Buffer.from(evento)).toString('base64') });
  }

  /** Assina como a Sefin assina seus documentos (NFS-e, evento), com o certificado do servidor. */
  private assinar(xml: string, elemento: string) {
    const caminho = `//*[local-name(.)='${elemento}']`;
    const assinatura = new SignedXml({
      privateKey: this.chaveServidor.privada,
      publicCert: this.chaveServidor.certificado,
      signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
      canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    });
    assinatura.addReference({
      xpath: caminho,
      transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'],
      digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
    });
    assinatura.computeSignature(xml, { location: { reference: caminho, action: 'after' } });
    return assinatura.getSignedXml();
  }

  /** A assinatura (a última do documento) precisa bater e ser do mesmo certificado que abriu a conexão. */
  private conferirAssinatura(xml: string, socket: TLSSocket) {
    const certificadoXml = xml.match(/<X509Certificate>([^<]+)<\/X509Certificate>/)?.[1];
    const assinatura = xml.match(/<Signature xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#">.*<\/Signature>/)?.[0];
    if (!certificadoXml || !assinatura) return ['Documento sem assinatura'];
    if (Buffer.from(certificadoXml, 'base64').compare(socket.getPeerCertificate().raw) !== 0) {
      return ['A DPS foi assinada com outro certificado'];
    }
    const verificador = new SignedXml({
      publicCert: `-----BEGIN CERTIFICATE-----\n${certificadoXml.match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE-----\n`,
    });
    verificador.loadSignature(assinatura);
    return verificador.checkSignature(xml) ? [] : ['Assinatura inválida'];
  }

  /** NFS-e como a Sefin devolve: o envelope com os dados apurados, a DPS recebida e a assinatura da Sefin. */
  private async gerarNfse(idDps: string, dps: string, cliente: string) {
    const numero = ++this.numero;
    const chave = `${idDps.slice(3, 10)}2${idDps.slice(11, 25)}${String(numero).padStart(13, '0')}2610${'1'.repeat(11)}`;
    const campo = (nome: string) => dps.match(new RegExp(`<${nome}>([^<]*)</${nome}>`))?.[1];
    const centavos = (nome: string) => Math.round(Number(campo(nome) ?? 0) * 100);
    const base = centavos('vServ') - centavos('vDescIncond');
    const aliquota = campo('pAliq');
    const iss = aliquota ? Math.round((base * Number(aliquota)) / 100) : 0;
    const retido = campo('tpRetISSQN') !== '1';
    const reais = (c: number) => (c / 100).toFixed(2);
    const local = municipio(campo('cLocPrestacao')!)!;
    const xml = this.assinar(
      '<?xml version="1.0" encoding="UTF-8"?>' +
        `<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infNFSe Id="NFS${chave}">` +
        `<xLocEmi>${municipio(campo('cLocEmi')!)!.nome}</xLocEmi><xLocPrestacao>${local.nome}</xLocPrestacao><nNFSe>${numero}</nNFSe>` +
        `<cLocIncid>${local.codigo}</cLocIncid><xLocIncid>${local.nome}</xLocIncid>` +
        `<xTribNac>${servicoNacional(campo('cTribNac')!)!.descricao.slice(0, 600)}</xTribNac>` +
        `<verAplic>SefinNac_Teste</verAplic><ambGer>2</ambGer><tpEmis>1</tpEmis><procEmi>1</procEmi><cStat>100</cStat>` +
        `<dhProc>${dataHoraComFuso()}</dhProc><nDFSe>${numero}</nDFSe>` +
        `<emit><CNPJ>${campo('CNPJ')}</CNPJ>${campo('IM') ? `<IM>${campo('IM')}</IM>` : ''}<xNome>${cliente.split(':')[0]}</xNome>` +
        '<enderNac><xLgr>Rua das Flores</xLgr><nro>100</nro><xBairro>Centro</xBairro><cMun>3556503</cMun><UF>SP</UF><CEP>13220000</CEP></enderNac>' +
        '<fone>11999998888</fone><email>contato@empresa.com.br</email></emit>' +
        `<valores>${aliquota ? `<vBC>${reais(base)}</vBC><pAliqAplic>${aliquota}</pAliqAplic><vISSQN>${reais(iss)}</vISSQN>` : ''}` +
        `${retido && iss ? `<vTotalRet>${reais(iss)}</vTotalRet>` : ''}<vLiq>${reais(base - (retido ? iss : 0))}</vLiq></valores>` +
        dps.replace(/^<\?xml[^>]*>/, '') +
        '</infNFSe></NFSe>',
      'infNFSe',
    );
    const erros = await validarXml(xml, 'nfse');
    if (erros.length) throw new Error(`A Sefin falsa gerou NFS-e fora do esquema: ${erros.join('; ')}`);
    return { chave, xml };
  }
}

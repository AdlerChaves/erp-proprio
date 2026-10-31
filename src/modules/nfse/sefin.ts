import { Inject, Injectable } from '@nestjs/common';
import { request } from 'node:https';
import { gunzipSync, gzipSync } from 'node:zlib';
import { AmbienteNfse } from '../empresas/empresa.entity';
import type { CertificadoA1 } from './certificado';

/**
 * Cliente da API do Emissor Nacional da NFS-e (Sefin Nacional). A autenticação é o próprio certificado
 * A1 da empresa na conexão TLS (mTLS); não há usuário nem token.
 * Rotas: Manual dos Contribuintes - API do Emissor Público Nacional (gov.br/nfse).
 */
export const URLS_SEFIN: Record<AmbienteNfse, string> = {
  [AmbienteNfse.PRODUCAO]: 'https://sefin.nfse.gov.br/SefinNacional',
  [AmbienteNfse.HOMOLOGACAO]: 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional',
};

export interface OpcoesSefin {
  urls: Record<AmbienteNfse, string>;
  /** Autoridades aceitas no certificado do servidor; vazio usa as do Node (os testes trocam por uma própria). */
  ca?: string[];
  timeoutMs: number;
}

export const OPCOES_SEFIN = Symbol('OPCOES_SEFIN');

/** Os endereços oficiais, ou os do .env se o governo mudar algum. */
export const opcoesPadrao = (): OpcoesSefin => ({
  urls: {
    [AmbienteNfse.PRODUCAO]: process.env.NFSE_URL_PRODUCAO || URLS_SEFIN[AmbienteNfse.PRODUCAO],
    [AmbienteNfse.HOMOLOGACAO]: process.env.NFSE_URL_HOMOLOGACAO || URLS_SEFIN[AmbienteNfse.HOMOLOGACAO],
  },
  timeoutMs: 60_000,
});

export interface MensagemSefin {
  codigo: string | null;
  descricao: string;
}

export interface NfseGerada {
  chaveAcesso: string;
  xml: string;
  alertas: MensagemSefin[];
}

/** A Sefin respondeu e recusou: as mensagens dizem o motivo (código E0000 e descrição). */
export class RecusaSefinError extends Error {
  constructor(readonly mensagens: MensagemSefin[]) {
    super(mensagens.map((m) => (m.codigo ? `${m.codigo} - ${m.descricao}` : m.descricao)).join('; '));
  }
}

/** Não deu para falar com a Sefin (rede, tempo esgotado, erro interno dela): o resultado é desconhecido. */
export class FalhaComunicacaoSefinError extends Error {}

const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** A Sefin alterna "erros"/"erro", lista/objeto e maiúsculas nos campos das mensagens. */
function mensagens(lista: unknown): MensagemSefin[] {
  const itens = Array.isArray(lista) ? lista : lista ? [lista] : [];
  return itens.map((item: Record<string, unknown>) => {
    const descricao = texto(item.descricao ?? item.Descricao ?? item.mensagem ?? item.Mensagem) ?? 'Erro sem descrição';
    const complemento = texto(item.complemento ?? item.Complemento);
    return {
      codigo: texto(item.codigo ?? item.Codigo),
      descricao: complemento ? `${descricao} (${complemento})` : descricao,
    };
  });
}

const descompactar = (b64: string) => gunzipSync(Buffer.from(b64, 'base64')).toString('utf8');

/** Todos os valores de campos "eventoXmlGZipB64" (em qualquer caixa), em qualquer nível de objetos e listas. */
function camposEvento(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.flatMap(camposEvento);
  if (!valor || typeof valor !== 'object') return [];
  return Object.entries(valor).flatMap(([nome, v]) =>
    /^eventoXmlGZipB64$/i.test(nome) && typeof v === 'string' ? [v] : camposEvento(v),
  );
}

@Injectable()
export class SefinCliente {
  constructor(@Inject(OPCOES_SEFIN) private readonly opcoes: OpcoesSefin) {}

  /** POST /nfse: envia a DPS assinada (gzip + base64) e recebe a NFS-e gerada. */
  async emitir(ambiente: AmbienteNfse, certificado: CertificadoA1, dpsAssinada: string): Promise<NfseGerada> {
    const corpo = JSON.stringify({ dpsXmlGZipB64: gzipSync(Buffer.from(dpsAssinada, 'utf8')).toString('base64') });
    const resposta = await this.requisitar(ambiente, certificado, 'POST', '/nfse', corpo);
    return this.nfse(resposta);
  }

  /** GET /dps/{id}: a chave de acesso da NFS-e gerada por esta DPS, ou null se ela ainda não virou nota. */
  async chaveDaDps(ambiente: AmbienteNfse, certificado: CertificadoA1, idDps: string) {
    const resposta = await this.requisitar(ambiente, certificado, 'GET', `/dps/${idDps}`);
    if (resposta.status === 404) return null;
    const chave = texto(this.json(resposta).chaveAcesso);
    if (resposta.status !== 200 || !chave) throw this.erro(resposta);
    return chave;
  }

  /** GET /nfse/{chave}: o XML da NFS-e. */
  async consultar(ambiente: AmbienteNfse, certificado: CertificadoA1, chaveAcesso: string) {
    return this.nfse(await this.requisitar(ambiente, certificado, 'GET', `/nfse/${chaveAcesso}`));
  }

  /** POST /nfse/{chave}/eventos: envia o pedido de registro de evento assinado e recebe o XML do evento gerado. */
  async registrarEvento(ambiente: AmbienteNfse, certificado: CertificadoA1, chaveAcesso: string, pedidoAssinado: string) {
    const corpo = JSON.stringify({ pedidoRegistroEventoXmlGZipB64: gzipSync(Buffer.from(pedidoAssinado, 'utf8')).toString('base64') });
    const resposta = await this.requisitar(ambiente, certificado, 'POST', `/nfse/${chaveAcesso}/eventos`, corpo);
    const dados = this.json(resposta);
    const xml = texto(dados.eventoXmlGZipB64);
    if (resposta.status >= 300 || !xml || mensagens(dados.erros ?? dados.erro).length) throw this.erro(resposta);
    try {
      return descompactar(xml);
    } catch {
      throw new FalhaComunicacaoSefinError('A Sefin devolveu o XML do evento corrompido');
    }
  }

  /**
   * GET /nfse/{chave}/eventos/{tipo}/1: o evento daquele tipo já registrado na nota, ou null se não houver.
   * O manual não descreve o corpo da resposta; o XML é procurado em qualquer campo "eventoXmlGZipB64" dela.
   */
  async evento(ambiente: AmbienteNfse, certificado: CertificadoA1, chaveAcesso: string, tipo: string) {
    const resposta = await this.requisitar(ambiente, certificado, 'GET', `/nfse/${chaveAcesso}/eventos/${tipo}/1`);
    if (resposta.status === 404) return null;
    if (resposta.status !== 200) throw this.erro(resposta);
    for (const b64 of camposEvento(this.json(resposta))) {
      try {
        const xml = descompactar(b64);
        if (xml.includes(`<chNFSe>${chaveAcesso}</chNFSe>`) && xml.includes(`<e${tipo}>`)) return xml;
      } catch {
        // Campo que não é um XML compactado: segue procurando.
      }
    }
    return null;
  }

  private nfse(resposta: { status: number; corpo: string }): NfseGerada {
    const dados = this.json(resposta);
    const xml = texto(dados.nfseXmlGZipB64);
    if (resposta.status >= 300 || !xml || mensagens(dados.erros ?? dados.erro).length) throw this.erro(resposta);
    let nfse: string;
    try {
      nfse = descompactar(xml);
    } catch {
      throw new FalhaComunicacaoSefinError('A Sefin devolveu o XML da NFS-e corrompido');
    }
    const chave = texto(dados.chaveAcesso) ?? nfse.match(/<chNFSe>([^<]+)<\/chNFSe>/)?.[1] ?? nfse.match(/Id="NFS(\d{50})"/)?.[1];
    if (!chave) throw new FalhaComunicacaoSefinError('A Sefin não informou a chave de acesso da NFS-e');
    return { chaveAcesso: chave, xml: nfse, alertas: mensagens(dados.alertas) };
  }

  private json(resposta: { status: number; corpo: string }): Record<string, unknown> {
    try {
      const dados: unknown = JSON.parse(resposta.corpo);
      return dados && typeof dados === 'object' ? (dados as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  /** Resposta com mensagens de erro é recusa; o resto (5xx, resposta sem sentido) deixa o resultado em aberto. */
  private erro(resposta: { status: number; corpo: string }) {
    const dados = this.json(resposta);
    const lista = mensagens(dados.erros ?? dados.erro);
    if (resposta.status < 500 && lista.length) return new RecusaSefinError(lista);
    if (resposta.status === 401 || resposta.status === 403) {
      return new RecusaSefinError([{ codigo: null, descricao: `A Sefin recusou o certificado digital (HTTP ${resposta.status})` }]);
    }
    return new FalhaComunicacaoSefinError(`A Sefin respondeu de forma inesperada (HTTP ${resposta.status})`);
  }

  private requisitar(ambiente: AmbienteNfse, certificado: CertificadoA1, metodo: string, rota: string, corpo?: string) {
    const url = new URL(this.opcoes.urls[ambiente] + rota);
    return new Promise<{ status: number; corpo: string }>((resolver, rejeitar) => {
      const req = request(
        url,
        {
          method: metodo,
          key: certificado.chavePrivadaPem,
          cert: [certificado.certificadoPem, ...certificado.cadeiaPem].join('\n'),
          ca: this.opcoes.ca,
          // Cada empresa tem seu certificado: a conexão não é reaproveitada entre elas.
          agent: false,
          timeout: this.opcoes.timeoutMs,
          headers: {
            Accept: 'application/json',
            ...(corpo ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(corpo) } : {}),
          },
        },
        (res) => {
          const partes: Buffer[] = [];
          res.on('data', (p: Buffer) => partes.push(p));
          res.on('end', () => resolver({ status: res.statusCode ?? 0, corpo: Buffer.concat(partes).toString('utf8') }));
          res.on('error', (e) => rejeitar(new FalhaComunicacaoSefinError(`A conexão com a Sefin caiu: ${e.message}`)));
        },
      );
      req.on('timeout', () => req.destroy(new Error('tempo esgotado')));
      req.on('error', (e) => rejeitar(new FalhaComunicacaoSefinError(`Não foi possível falar com a Sefin Nacional: ${e.message}`)));
      req.end(corpo);
    });
  }
}

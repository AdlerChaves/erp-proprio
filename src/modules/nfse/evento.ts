import { tag, texto, VERSAO_APLICATIVO } from './dps';
import { validarXml, VERSAO_LEIAUTE } from './esquemas';

/**
 * Pedido de registro de evento da NFS-e nacional, versão 1.01 (Anexo II da documentação técnica, gov.br/nfse).
 * Por enquanto só o cancelamento pelo próprio emitente (evento 101101).
 */

/** cMotivo do cancelamento (TSCodJustCanc). */
export enum MotivoCancelamento {
  ERRO_EMISSAO = 1,
  SERVICO_NAO_PRESTADO = 2,
  OUTROS = 9,
}

export const EVENTO_CANCELAMENTO = '101101';

export interface DadosCancelamento {
  ambiente: number;
  /** dhEvento, já no formato AAAA-MM-DDThh:mm:ss±hh:mm; não pode ser posterior ao recebimento (E1843). */
  dataHoraEvento: string;
  /** Autor: o prestador, com a mesma raiz de CNPJ do certificado que assina (E0812). */
  cnpjAutor: string;
  chaveAcesso: string;
  motivo: MotivoCancelamento;
  /** xMotivo: de 15 a 255 caracteres. */
  descricao: string;
}

/** Id do pedido: "PRE" + chave de acesso (50) + código do evento (6), sem número de pedido desde a versão 1.01 (E1827). */
export const idPedidoEvento = (chaveAcesso: string, evento: string) => `PRE${chaveAcesso}${evento}`;

export function gerarPedidoCancelamento(d: DadosCancelamento) {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<pedRegEvento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="${VERSAO_LEIAUTE}">` +
    `<infPedReg Id="${idPedidoEvento(d.chaveAcesso, EVENTO_CANCELAMENTO)}">` +
    tag('tpAmb', String(d.ambiente)) +
    tag('verAplic', VERSAO_APLICATIVO) +
    tag('dhEvento', d.dataHoraEvento) +
    tag('CNPJAutor', d.cnpjAutor) +
    tag('chNFSe', d.chaveAcesso) +
    `<e${EVENTO_CANCELAMENTO}>` +
    tag('xDesc', 'Cancelamento de NFS-e') +
    tag('cMotivo', String(d.motivo)) +
    tag('xMotivo', texto(d.descricao, 255)) +
    `</e${EVENTO_CANCELAMENTO}>` +
    '</infPedReg>' +
    '</pedRegEvento>'
  );
}

/** Valida o pedido contra o XSD oficial; devolve as mensagens de erro (vazio se estiver válido). */
export const validarPedidoEvento = (xml: string) => validarXml(xml, 'pedidoEvento');

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** O xMotivo de um evento (ou pedido) de cancelamento, já sem as entidades do XML. */
export const motivoDoEvento = (xml: string) =>
  xml.match(/<xMotivo>([^<]*)<\/xMotivo>/)?.[1].replace(/&(amp|lt|gt|quot|apos);/g, (_, nome: string) => ENTIDADES[nome]) ?? null;

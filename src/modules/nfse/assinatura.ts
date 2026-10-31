import { SignedXml } from 'xml-crypto';
import type { CertificadoA1 } from './certificado';

const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const DECLARACAO = '<?xml version="1.0" encoding="UTF-8"?>';

type Chaves = Pick<CertificadoA1, 'chavePrivadaPem' | 'certificadoPem'>;

/**
 * Assinatura no padrão da NFS-e nacional: XMLDSig "enveloped" sobre o elemento informado (referência ao Id dele),
 * RSA-SHA1, canonicalização C14N 1.0, com a <Signature> sem prefixo logo depois dele (último filho da raiz)
 * e o certificado em KeyInfo. É o mesmo formato que o Emissor Nacional aceita das outras implementações.
 */
function assinar(xml: string, elemento: string, certificado: Chaves) {
  const caminho = `//*[local-name(.)='${elemento}']`;
  const assinatura = new SignedXml({
    privateKey: certificado.chavePrivadaPem,
    publicCert: certificado.certificadoPem,
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    canonicalizationAlgorithm: C14N,
  });
  assinatura.addReference({
    xpath: caminho,
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', C14N],
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
  });
  assinatura.computeSignature(xml, { location: { reference: caminho, action: 'after' } });
  // Sem a declaração com a codificação, a Sefin recusa o arquivo (E1229). Ela fica fora do trecho assinado.
  const assinado = assinatura.getSignedXml();
  return assinado.startsWith('<?xml') ? assinado : DECLARACAO + assinado;
}

/** DPS: assinatura sobre o infDPS. */
export const assinarDps = (xml: string, certificado: Chaves) => assinar(xml, 'infDPS', certificado);

/** Pedido de registro de evento (ex.: cancelamento): assinatura sobre o infPedReg. */
export const assinarPedidoEvento = (xml: string, certificado: Chaves) => assinar(xml, 'infPedReg', certificado);

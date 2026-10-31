import forge from 'node-forge';

/** Certificado A1 (arquivo .pfx/.p12) aberto: o que a assinatura da DPS e a conexão com a Sefin precisam. */
export interface CertificadoA1 {
  chavePrivadaPem: string;
  certificadoPem: string;
  /** Certificados intermediários que vieram no arquivo, para a conexão apresentar a cadeia. */
  cadeiaPem: string[];
  titular: string;
  /** CNPJ do e-CNPJ ICP-Brasil; null em certificado de pessoa física ou sem a extensão. */
  cnpj: string | null;
  validoDe: Date;
  validoAte: Date;
}

export class CertificadoInvalidoError extends Error {}

/** OID 2.16.76.1.3.3 (CNPJ da pessoa jurídica titular, nos certificados ICP-Brasil), em DER. */
const OID_CNPJ = '\x06\x05\x60\x4c\x01\x03\x03';

/**
 * O CNPJ do e-CNPJ: no campo "otherName" do nome alternativo (OID 2.16.76.1.3.3) ou, na falta dele,
 * no final do nome comum, que a ICP-Brasil escreve como "RAZÃO SOCIAL:12345678000199".
 */
function cnpjDoCertificado(cert: forge.pki.Certificate) {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const posicao = der.indexOf(OID_CNPJ);
  if (posicao >= 0) {
    const cnpj = der.slice(posicao + OID_CNPJ.length, posicao + OID_CNPJ.length + 24).match(/\d{14}/);
    if (cnpj) return cnpj[0];
  }
  const nome = String(cert.subject.getField('CN')?.value ?? '');
  return nome.match(/:(\d{14})$/)?.[1] ?? null;
}

const mesmaChave = (cert: forge.pki.Certificate, chave: forge.pki.rsa.PrivateKey) => {
  const publica = cert.publicKey as forge.pki.rsa.PublicKey;
  return publica.n?.equals(chave.n) ?? false;
};

/** Abre o .pfx. Recusa senha errada, arquivo que não é PKCS#12 e arquivo sem chave privada. */
export function abrirCertificado(pfx: Buffer, senha: string): CertificadoA1 {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(pfx.toString('binary')), senha);
  } catch (erro) {
    if (/password/i.test((erro as Error).message)) throw new CertificadoInvalidoError('A senha do certificado está incorreta');
    throw new CertificadoInvalidoError('O arquivo não é um certificado A1 válido (.pfx ou .p12)');
  }

  const sacolas = (tipo: string) => p12.getBags({ bagType: tipo })[tipo] ?? [];
  const chave = [...sacolas(forge.pki.oids.pkcs8ShroudedKeyBag), ...sacolas(forge.pki.oids.keyBag)].find((s) => s.key)?.key as
    | forge.pki.rsa.PrivateKey
    | undefined;
  if (!chave) throw new CertificadoInvalidoError('O arquivo não traz a chave privada; exporte o certificado A1 com a chave');
  const certificados = sacolas(forge.pki.oids.certBag).flatMap((s) => (s.cert ? [s.cert] : []));
  const proprio = certificados.find((c) => mesmaChave(c, chave));
  if (!proprio) throw new CertificadoInvalidoError('O arquivo não traz o certificado da chave privada');

  return {
    chavePrivadaPem: forge.pki.privateKeyToPem(chave),
    certificadoPem: forge.pki.certificateToPem(proprio),
    cadeiaPem: certificados.filter((c) => c !== proprio).map((c) => forge.pki.certificateToPem(c)),
    titular: String(proprio.subject.getField('CN')?.value ?? ''),
    cnpj: cnpjDoCertificado(proprio),
    validoDe: proprio.validity.notBefore,
    validoAte: proprio.validity.notAfter,
  };
}

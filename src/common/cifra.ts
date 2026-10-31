import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Cifra segredos guardados no banco (o certificado digital e a senha dele) com AES-256-GCM.
 * A chave fica fora do banco, em CHAVE_CERTIFICADOS: quem tiver só um backup não lê o certificado.
 * Formato: "v1:" + base64(iv de 12 bytes + tag de 16 bytes + texto cifrado).
 */
const VERSAO = 'v1:';

function chave() {
  const hex = process.env.CHAVE_CERTIFICADOS?.trim();
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('CHAVE_CERTIFICADOS não configurada: gere com "openssl rand -hex 32" e coloque no .env do servidor');
  }
  return Buffer.from(hex, 'hex');
}

export const cifraConfigurada = () => {
  try {
    chave();
    return true;
  } catch {
    return false;
  }
};

export function cifrar(texto: string) {
  const iv = randomBytes(12);
  const cifra = createCipheriv('aes-256-gcm', chave(), iv);
  const conteudo = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()]);
  return VERSAO + Buffer.concat([iv, cifra.getAuthTag(), conteudo]).toString('base64');
}

/** Falha se o texto foi alterado ou cifrado com outra chave. */
export function decifrar(cifrado: string) {
  if (!cifrado.startsWith(VERSAO)) throw new Error('Formato de dado cifrado desconhecido');
  const bytes = Buffer.from(cifrado.slice(VERSAO.length), 'base64');
  const decifra = createDecipheriv('aes-256-gcm', chave(), bytes.subarray(0, 12));
  decifra.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decifra.update(bytes.subarray(28)), decifra.final()]).toString('utf8');
}

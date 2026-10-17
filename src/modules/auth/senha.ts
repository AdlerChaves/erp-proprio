import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (senha: string, salt: Buffer, tamanho: number) => Promise<Buffer>;

const TAMANHO_HASH = 64;

/** Formato armazenado: scrypt$<salt hex>$<hash hex>. */
export async function gerarHashSenha(senha: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(senha, salt, TAMANHO_HASH);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verificarSenha(senha: string, armazenado: string) {
  const [algoritmo, saltHex, hashHex] = armazenado.split('$');
  if (algoritmo !== 'scrypt' || !saltHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, 'hex');
  const hash = await scrypt(senha, Buffer.from(saltHex, 'hex'), esperado.length);
  return timingSafeEqual(hash, esperado);
}

let hashFicticio: Promise<string> | undefined;

/** Usado quando o e-mail não existe, para o login levar o mesmo tempo nos dois casos. */
export function obterHashFicticio() {
  hashFicticio ??= gerarHashSenha(randomBytes(16).toString('hex'));
  return hashFicticio;
}

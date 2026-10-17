/** Recusa subir com segredo curto ou com o valor de exemplo do .env.example. */
export function validarSegredoJwt(segredo: string) {
  if (segredo.length < 32 || segredo.startsWith('troque-por')) {
    throw new Error('JWT_SECRET precisa ter pelo menos 32 caracteres aleatórios. Gere com: openssl rand -hex 32');
  }
  return segredo;
}

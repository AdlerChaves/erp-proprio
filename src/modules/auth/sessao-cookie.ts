import type { CookieOptions, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';

/**
 * Sessão do frontend: o token vai num cookie httpOnly, que nenhum script da página consegue ler.
 * Clientes de API (Swagger, integrações) continuam usando o cabeçalho Authorization.
 */
export const COOKIE_SESSAO = 'erp_sessao';

/** O frontend envia este cabeçalho para pedir a sessão em cookie em vez do token no corpo. */
export const CABECALHO_MODO_COOKIE = 'x-sessao';

/** Nas escritas feitas por cookie, o frontend repete aqui o csrfToken recebido no login ou em /auth/me. */
export const CABECALHO_CSRF = 'x-csrf-token';

export const pedeCookie = (req: Request) => req.headers[CABECALHO_MODO_COOKIE] === 'cookie';

function opcoesCookie(): CookieOptions {
  const seguro = process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === 'true'
    : process.env.NODE_ENV === 'production';
  return { httpOnly: true, secure: seguro, sameSite: 'lax', path: '/api' };
}

export function gravarCookieSessao(res: Response, token: string) {
  const segundos = Number(process.env.JWT_EXPIRES_IN ?? 28800);
  res.cookie(COOKIE_SESSAO, token, { ...opcoesCookie(), maxAge: segundos * 1000 });
}

export function apagarCookieSessao(res: Response) {
  res.clearCookie(COOKIE_SESSAO, opcoesCookie());
}

/** Comparação em tempo constante, para o token CSRF não vazar por medição de tempo. */
export function csrfConfere(recebido: unknown, esperado: string | undefined) {
  if (typeof recebido !== 'string' || !esperado) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

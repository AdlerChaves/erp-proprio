import { Perfil } from '../usuarios/perfil.enum';

/** Conteúdo do JWT. O perfil não vai no token: é lido do banco a cada requisição. */
export interface TokenPayload {
  sub: string;
  empresaId: string;
  /** Versão de token do usuário quando o token foi emitido; se ela mudou, o token não vale mais. */
  ver: number;
  /** Exigido no cabeçalho X-CSRF-Token nas escritas autenticadas por cookie. */
  csrf: string;
}

export interface Sessao {
  usuarioId: string;
  empresaId: string;
  perfil: Perfil;
  tokenVersao: number;
  csrfToken: string;
}

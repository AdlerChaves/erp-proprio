import { Perfil } from '../usuarios/perfil.enum';

/** Conteúdo do JWT. O perfil não vai no token: é lido do banco a cada requisição. */
export interface TokenPayload {
  sub: string;
  empresaId: string;
}

export interface Sessao {
  usuarioId: string;
  empresaId: string;
  perfil: Perfil;
}

import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Perfil } from '../usuarios/perfil.enum';
import { Sessao } from './sessao';

export const PUBLICO_KEY = 'publico';
export const PERFIS_KEY = 'perfis';

/** Libera a rota sem token. */
export const Publico = () => SetMetadata(PUBLICO_KEY, true);

/** Restringe a rota aos perfis informados. Sem o decorator, qualquer usuário autenticado acessa. */
export const Perfis = (...perfis: Perfil[]) => SetMetadata(PERFIS_KEY, perfis);

export const SessaoAtual = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Sessao => ctx.switchToHttp().getRequest().sessao,
);

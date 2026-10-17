import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { mergeMap } from 'rxjs';
import { Sessao } from '../auth/sessao';
import { AuditoriaService } from './auditoria.service';

const ESCRITA = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Registra toda escrita autenticada bem-sucedida. Rotas públicas (login, cadastro)
 * são auditadas pelo próprio AuthService, que sabe o resultado.
 */
@Injectable()
export class AuditoriaInterceptor implements NestInterceptor {
  constructor(private readonly auditoria: AuditoriaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest<Request & { sessao?: Sessao }>();
    if (!ESCRITA.has(req.method) || !req.sessao) return next.handle();

    const rota: string = req.route?.path ?? req.path;
    return next.handle().pipe(
      mergeMap(async (resposta: unknown) => {
        const idResposta =
          resposta && typeof resposta === 'object' && !Array.isArray(resposta) ? (resposta as { id?: unknown }).id : undefined;
        await this.auditoria.registrar({
          empresaId: req.sessao!.empresaId,
          usuarioId: req.sessao!.usuarioId,
          acao: `${req.method} ${rota}`.slice(0, 150),
          recurso: rota.replace(/^\/api\//, '').split('/')[0] || null,
          recursoId: (req.params.id as string | undefined) ?? (typeof idResposta === 'string' ? idResposta : null),
          dados: req.body && Object.keys(req.body).length ? req.body : null,
          ip: req.ip ?? null,
        });
        return resposta;
      }),
    );
  }
}

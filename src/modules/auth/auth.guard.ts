import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import { Perfil } from '../usuarios/perfil.enum';
import { UsuarioEmpresa } from '../usuarios/usuario-empresa.entity';
import { PERFIS_KEY, PUBLICO_KEY } from './auth.decorators';
import { Sessao, TokenPayload } from './sessao';
import { CABECALHO_CSRF, COOKIE_SESSAO, csrfConfere } from './sessao-cookie';

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Guard global: exige JWT válido e não revogado (no cabeçalho ou no cookie de sessão),
 * token CSRF nas escritas por cookie, acesso ativo à empresa do token e, se houver, o perfil exigido.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @InjectRepository(UsuarioEmpresa) private readonly vinculos: Repository<UsuarioEmpresa>,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const alvos = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLICO_KEY, alvos)) return true;

    const req = ctx.switchToHttp().getRequest<Request & { sessao?: Sessao }>();
    // O cabeçalho tem prioridade: outro site não consegue enviá-lo, então dispensa a checagem de CSRF.
    const [tipo, tokenCabecalho] = req.headers.authorization?.split(' ') ?? [];
    const porCabecalho = tipo === 'Bearer' && !!tokenCabecalho;
    const token: string | undefined = porCabecalho ? tokenCabecalho : req.cookies?.[COOKIE_SESSAO];
    if (!token) throw new UnauthorizedException('Token não informado');

    let payload: TokenPayload;
    try {
      payload = await this.jwt.verifyAsync<TokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    // Consulta a cada requisição para que bloqueios e trocas de perfil valham na hora.
    const vinculo = await this.vinculos.findOne({
      where: {
        usuarioId: payload.sub,
        empresaId: payload.empresaId,
        ativo: true,
        usuario: { ativo: true },
        empresa: { ativo: true },
      },
      relations: { usuario: true, empresa: true },
    });
    if (!vinculo) throw new UnauthorizedException('Acesso à empresa revogado');
    if (vinculo.usuario.tokenVersao !== payload.ver) {
      throw new UnauthorizedException('Sessão encerrada; faça login novamente');
    }
    if (!porCabecalho && !METODOS_SEGUROS.has(req.method) && !csrfConfere(req.headers[CABECALHO_CSRF], payload.csrf)) {
      throw new ForbiddenException('Token CSRF ausente ou inválido');
    }

    const perfis = this.reflector.getAllAndOverride<Perfil[] | undefined>(PERFIS_KEY, alvos);
    if (perfis?.length && !perfis.includes(vinculo.perfil)) {
      throw new ForbiddenException('Seu perfil não permite esta operação');
    }

    req.sessao = {
      usuarioId: payload.sub,
      empresaId: payload.empresaId,
      perfil: vinculo.perfil,
      tokenVersao: vinculo.usuario.tokenVersao,
      csrfToken: payload.csrf,
    };
    return true;
  }
}

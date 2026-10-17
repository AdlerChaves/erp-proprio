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

/** Guard global: exige JWT válido, acesso ativo à empresa do token e, se houver, o perfil exigido. */
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
    const [tipo, token] = req.headers.authorization?.split(' ') ?? [];
    if (tipo !== 'Bearer' || !token) throw new UnauthorizedException('Token não informado');

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

    const perfis = this.reflector.getAllAndOverride<Perfil[] | undefined>(PERFIS_KEY, alvos);
    if (perfis?.length && !perfis.includes(vinculo.perfil)) {
      throw new ForbiddenException('Seu perfil não permite esta operação');
    }

    req.sessao = { usuarioId: payload.sub, empresaId: payload.empresaId, perfil: vinculo.perfil };
    return true;
  }
}

import { Body, Controller, ForbiddenException, Get, HttpCode, Ip, Patch, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Publico, SessaoAtual } from './auth.decorators';
import { AuthService } from './auth.service';
import { AlterarSenhaDto } from './dto/alterar-senha.dto';
import { LoginDto } from './dto/login.dto';
import { RegistrarDto } from './dto/registrar.dto';
import { TrocarEmpresaDto } from './dto/trocar-empresa.dto';
import { Sessao } from './sessao';
import { apagarCookieSessao, gravarCookieSessao, pedeCookie } from './sessao-cookie';

/** Login e cadastro aceitam poucas tentativas por minuto por IP (THROTTLE_LOGIN_LIMITE, padrão 10). */
const LIMITE_ROTAS_PUBLICAS = {
  limit: () => Number(process.env.THROTTLE_LOGIN_LIMITE ?? 10),
  ttl: 60_000,
};

type SessaoEmitida = { accessToken: string; empresaId: string; csrfToken: string };

/**
 * Com o cabeçalho "X-Sessao: cookie" (frontend), o token vai num cookie httpOnly e não aparece no corpo.
 * Sem ele (Swagger, integrações), o token vem no corpo para ser usado no cabeçalho Authorization.
 */
function entregar(req: Request, res: Response, sessao: SessaoEmitida) {
  if (!pedeCookie(req)) return { accessToken: sessao.accessToken, empresaId: sessao.empresaId };
  gravarCookieSessao(res, sessao.accessToken);
  return { empresaId: sessao.empresaId, csrfToken: sessao.csrfToken };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Publico()
  @Throttle({ default: LIMITE_ROTAS_PUBLICAS })
  @Post('registrar')
  async registrar(
    @Body() dto: RegistrarDto,
    @Ip() ip: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Com o ERP na internet, CADASTRO_ABERTO=false impede que alguém de fora crie uma empresa nova.
    if (process.env.CADASTRO_ABERTO === 'false') {
      throw new ForbiddenException('O cadastro de novas empresas está desativado neste servidor. Peça acesso a um administrador.');
    }
    return entregar(req, res, await this.service.registrar(dto, ip));
  }

  @Publico()
  @Throttle({ default: LIMITE_ROTAS_PUBLICAS })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return entregar(req, res, await this.service.login(dto, ip));
  }

  @ApiBearerAuth()
  @Post('trocar-empresa')
  @HttpCode(200)
  async trocarEmpresa(
    @SessaoAtual() sessao: Sessao,
    @Body() dto: TrocarEmpresaDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return entregar(req, res, await this.service.trocarEmpresa(sessao, dto.empresaId));
  }

  @ApiBearerAuth()
  @Get('me')
  me(@SessaoAtual() sessao: Sessao) {
    return this.service.me(sessao);
  }

  /** Os tokens emitidos antes deixam de valer; a resposta traz um token novo. */
  @ApiBearerAuth()
  @Patch('senha')
  @HttpCode(200)
  async alterarSenha(
    @SessaoAtual() sessao: Sessao,
    @Body() dto: AlterarSenhaDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return entregar(req, res, await this.service.alterarSenha(sessao, dto));
  }

  /** Sai de todos os dispositivos: invalida todos os tokens do usuário, inclusive o atual. */
  @ApiBearerAuth()
  @Post('sessoes/encerrar')
  @HttpCode(204)
  async encerrarSessoes(@SessaoAtual() sessao: Sessao, @Res({ passthrough: true }) res: Response) {
    await this.service.encerrarSessoes(sessao);
    apagarCookieSessao(res);
  }

  /** Sai deste navegador: apaga o cookie de sessão. Para invalidar o token em todos os lugares, use sessoes/encerrar. */
  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    apagarCookieSessao(res);
  }
}

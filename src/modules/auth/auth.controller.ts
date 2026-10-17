import { Body, Controller, Get, HttpCode, Ip, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Publico, SessaoAtual } from './auth.decorators';
import { AuthService } from './auth.service';
import { AlterarSenhaDto } from './dto/alterar-senha.dto';
import { LoginDto } from './dto/login.dto';
import { RegistrarDto } from './dto/registrar.dto';
import { TrocarEmpresaDto } from './dto/trocar-empresa.dto';
import { Sessao } from './sessao';

/** Login e cadastro aceitam poucas tentativas por minuto por IP (THROTTLE_LOGIN_LIMITE, padrão 10). */
const LIMITE_ROTAS_PUBLICAS = {
  limit: () => Number(process.env.THROTTLE_LOGIN_LIMITE ?? 10),
  ttl: 60_000,
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Publico()
  @Throttle({ default: LIMITE_ROTAS_PUBLICAS })
  @Post('registrar')
  registrar(@Body() dto: RegistrarDto, @Ip() ip: string) {
    return this.service.registrar(dto, ip);
  }

  @Publico()
  @Throttle({ default: LIMITE_ROTAS_PUBLICAS })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.service.login(dto, ip);
  }

  @ApiBearerAuth()
  @Post('trocar-empresa')
  @HttpCode(200)
  trocarEmpresa(@SessaoAtual() sessao: Sessao, @Body() dto: TrocarEmpresaDto) {
    return this.service.trocarEmpresa(sessao, dto.empresaId);
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
  alterarSenha(@SessaoAtual() sessao: Sessao, @Body() dto: AlterarSenhaDto) {
    return this.service.alterarSenha(sessao, dto);
  }

  /** Sai de todos os dispositivos: invalida todos os tokens do usuário, inclusive o atual. */
  @ApiBearerAuth()
  @Post('sessoes/encerrar')
  @HttpCode(204)
  encerrarSessoes(@SessaoAtual() sessao: Sessao) {
    return this.service.encerrarSessoes(sessao);
  }
}

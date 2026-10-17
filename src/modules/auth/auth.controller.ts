import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Publico, SessaoAtual } from './auth.decorators';
import { AuthService } from './auth.service';
import { AlterarSenhaDto } from './dto/alterar-senha.dto';
import { LoginDto } from './dto/login.dto';
import { RegistrarDto } from './dto/registrar.dto';
import { TrocarEmpresaDto } from './dto/trocar-empresa.dto';
import { Sessao } from './sessao';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Publico()
  @Post('registrar')
  registrar(@Body() dto: RegistrarDto) {
    return this.service.registrar(dto);
  }

  @Publico()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.service.login(dto);
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

  @ApiBearerAuth()
  @Patch('senha')
  @HttpCode(204)
  alterarSenha(@SessaoAtual() sessao: Sessao, @Body() dto: AlterarSenhaDto) {
    return this.service.alterarSenha(sessao, dto);
  }
}

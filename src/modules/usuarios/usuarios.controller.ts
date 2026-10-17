import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Perfis, SessaoAtual } from '../auth/auth.decorators';
import { Sessao } from '../auth/sessao';
import { AdicionarUsuarioDto } from './dto/adicionar-usuario.dto';
import { AtualizarAcessoDto } from './dto/atualizar-acesso.dto';
import { Perfil } from './perfil.enum';
import { UsuariosService } from './usuarios.service';

@ApiTags('usuarios')
@ApiBearerAuth()
@Perfis(Perfil.ADMIN)
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly service: UsuariosService) {}

  @Get()
  listar(@SessaoAtual() sessao: Sessao) {
    return this.service.listar(sessao.empresaId);
  }

  @Post()
  adicionar(@SessaoAtual() sessao: Sessao, @Body() dto: AdicionarUsuarioDto) {
    return this.service.adicionar(sessao.empresaId, dto);
  }

  @Patch(':id')
  atualizarAcesso(
    @SessaoAtual() sessao: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarAcessoDto,
  ) {
    return this.service.atualizarAcesso(sessao.empresaId, id, dto);
  }
}

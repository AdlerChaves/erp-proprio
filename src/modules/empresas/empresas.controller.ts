import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Perfis, SessaoAtual } from '../auth/auth.decorators';
import { Sessao } from '../auth/sessao';
import { Perfil } from '../usuarios/perfil.enum';
import { CreateEmpresaDto } from './dto/create-empresa.dto';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { EmpresasService } from './empresas.service';

@ApiTags('empresas')
@ApiBearerAuth()
@Controller('empresas')
export class EmpresasController {
  constructor(private readonly service: EmpresasService) {}

  @Get('atual')
  atual(@SessaoAtual() sessao: Sessao) {
    return this.service.findOne(sessao.empresaId);
  }

  @Patch('atual')
  @Perfis(Perfil.ADMIN)
  update(@SessaoAtual() sessao: Sessao, @Body() dto: UpdateEmpresaDto) {
    return this.service.update(sessao.empresaId, dto);
  }

  /** Cria outra empresa para o usuário logado; use POST /auth/trocar-empresa para acessá-la. */
  @Post()
  create(@SessaoAtual() sessao: Sessao, @Body() dto: CreateEmpresaDto) {
    return this.service.criarParaUsuario(sessao.usuarioId, dto);
  }
}

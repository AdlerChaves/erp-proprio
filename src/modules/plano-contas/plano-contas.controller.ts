import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Perfis, SessaoAtual } from '../auth/auth.decorators';
import { Sessao } from '../auth/sessao';
import { Perfil } from '../usuarios/perfil.enum';
import { CreatePlanoContaDto } from './dto/create-plano-conta.dto';
import { FiltroPlanoContaDto } from './dto/filtro-plano-conta.dto';
import { UpdatePlanoContaDto } from './dto/update-plano-conta.dto';
import { PlanoContasService } from './plano-contas.service';

@ApiTags('plano-contas')
@ApiBearerAuth()
@Controller('plano-contas')
export class PlanoContasController {
  constructor(private readonly service: PlanoContasService) {}

  @Get()
  findAll(@SessaoAtual() sessao: Sessao, @Query() filtro: FiltroPlanoContaDto) {
    return this.service.findAll(sessao.empresaId, filtro);
  }

  @Get(':id')
  findOne(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(sessao.empresaId, id);
  }

  @Post()
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  create(@SessaoAtual() sessao: Sessao, @Body() dto: CreatePlanoContaDto) {
    return this.service.create(sessao.empresaId, dto);
  }

  @Patch(':id')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  update(
    @SessaoAtual() sessao: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlanoContaDto,
  ) {
    return this.service.update(sessao.empresaId, id, dto);
  }

  @Delete(':id')
  @Perfis(Perfil.ADMIN)
  @HttpCode(204)
  remove(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(sessao.empresaId, id);
  }
}

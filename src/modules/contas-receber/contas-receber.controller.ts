import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Perfis, SessaoAtual } from '../auth/auth.decorators';
import { Sessao } from '../auth/sessao';
import { Perfil } from '../usuarios/perfil.enum';
import { ContasReceberService } from './contas-receber.service';
import { BaixaContaReceberDto } from './dto/baixa-conta-receber.dto';
import { CreateContaReceberDto } from './dto/create-conta-receber.dto';
import { FiltroContaReceberDto } from './dto/filtro-conta-receber.dto';
import { UpdateContaReceberDto } from './dto/update-conta-receber.dto';

@ApiTags('contas-receber')
@ApiBearerAuth()
@Controller('contas-receber')
export class ContasReceberController {
  constructor(private readonly service: ContasReceberService) {}

  @Get()
  findAll(@SessaoAtual() sessao: Sessao, @Query() filtro: FiltroContaReceberDto) {
    return this.service.findAll(sessao.empresaId, filtro);
  }

  @Get(':id')
  findOne(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(sessao.empresaId, id);
  }

  @Post()
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  create(@SessaoAtual() sessao: Sessao, @Body() dto: CreateContaReceberDto) {
    return this.service.create(sessao.empresaId, dto);
  }

  @Patch(':id')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  update(
    @SessaoAtual() sessao: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContaReceberDto,
  ) {
    return this.service.update(sessao.empresaId, id, dto);
  }

  @Post(':id/baixa')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  baixar(
    @SessaoAtual() sessao: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BaixaContaReceberDto,
  ) {
    return this.service.baixar(sessao.empresaId, id, dto);
  }

  @Post(':id/estorno')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  estornar(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.estornar(sessao.empresaId, id);
  }

  @Post(':id/cancelamento')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  cancelar(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.cancelar(sessao.empresaId, id);
  }
}

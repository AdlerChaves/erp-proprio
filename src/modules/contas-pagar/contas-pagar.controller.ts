import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Perfis, SessaoAtual } from '../auth/auth.decorators';
import { Sessao } from '../auth/sessao';
import { Perfil } from '../usuarios/perfil.enum';
import { ContasPagarService } from './contas-pagar.service';
import { BaixaContaPagarDto } from './dto/baixa-conta-pagar.dto';
import { CreateContaPagarDto } from './dto/create-conta-pagar.dto';
import { FiltroContaPagarDto } from './dto/filtro-conta-pagar.dto';
import { UpdateContaPagarDto } from './dto/update-conta-pagar.dto';

@ApiTags('contas-pagar')
@ApiBearerAuth()
@Controller('contas-pagar')
export class ContasPagarController {
  constructor(private readonly service: ContasPagarService) {}

  @Get()
  findAll(@SessaoAtual() sessao: Sessao, @Query() filtro: FiltroContaPagarDto) {
    return this.service.findAll(sessao.empresaId, filtro);
  }

  @Get(':id')
  findOne(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(sessao.empresaId, id);
  }

  @Post()
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  create(@SessaoAtual() sessao: Sessao, @Body() dto: CreateContaPagarDto) {
    return this.service.create(sessao.empresaId, dto);
  }

  @Patch(':id')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  update(
    @SessaoAtual() sessao: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContaPagarDto,
  ) {
    return this.service.update(sessao.empresaId, id, dto);
  }

  @Post(':id/baixa')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  baixar(
    @SessaoAtual() sessao: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BaixaContaPagarDto,
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

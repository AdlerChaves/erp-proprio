import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Perfis, SessaoAtual } from '../auth/auth.decorators';
import { Sessao } from '../auth/sessao';
import { Perfil } from '../usuarios/perfil.enum';
import { ComprasService } from './compras.service';
import { CreateCompraDto } from './dto/create-compra.dto';
import { FiltroComprasDto } from './dto/filtro-compras.dto';
import { ReceberCompraDto } from './dto/receber-compra.dto';
import { UpdateCompraDto } from './dto/update-compra.dto';

/** Compras mostram custos e geram contas a pagar: o perfil VENDAS não acessa. */
@ApiTags('compras')
@ApiBearerAuth()
@Perfis(Perfil.ADMIN, Perfil.FINANCEIRO, Perfil.CONSULTA)
@Controller('compras')
export class ComprasController {
  constructor(private readonly service: ComprasService) {}

  @Get()
  findAll(@SessaoAtual() sessao: Sessao, @Query() filtro: FiltroComprasDto) {
    return this.service.findAll(sessao.empresaId, filtro);
  }

  @Get(':id')
  findOne(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(sessao.empresaId, id);
  }

  @Get(':id/pdf')
  async pdf(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const { nome, conteudo } = await this.service.pdf(sessao.empresaId, id, sessao.usuarioId);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${nome}"` });
    return new StreamableFile(conteudo);
  }

  @Post()
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  create(@SessaoAtual() sessao: Sessao, @Body() dto: CreateCompraDto) {
    return this.service.create(sessao.empresaId, dto);
  }

  @Patch(':id')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  update(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCompraDto) {
    return this.service.update(sessao.empresaId, id, dto);
  }

  /** Entrada no estoque e contas a pagar. */
  @Post(':id/recebimento')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  @HttpCode(200)
  receber(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReceberCompraDto) {
    return this.service.receber(sessao.empresaId, id, dto);
  }

  @Post(':id/cancelamento')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  @HttpCode(200)
  cancelar(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.cancelar(sessao.empresaId, id);
  }
}

import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Perfis, SessaoAtual } from '../auth/auth.decorators';
import { Sessao } from '../auth/sessao';
import { Perfil } from '../usuarios/perfil.enum';
import { CreateVendaDto } from './dto/create-venda.dto';
import { FaturarVendaDto } from './dto/faturar-venda.dto';
import { FiltroVendasDto } from './dto/filtro-vendas.dto';
import { UpdateVendaDto } from './dto/update-venda.dto';
import { VendasService } from './vendas.service';

const VENDEM = [Perfil.ADMIN, Perfil.FINANCEIRO, Perfil.VENDAS];

@ApiTags('vendas')
@ApiBearerAuth()
@Controller('vendas')
export class VendasController {
  constructor(private readonly service: VendasService) {}

  @Get()
  findAll(@SessaoAtual() sessao: Sessao, @Query() filtro: FiltroVendasDto) {
    return this.service.findAll(sessao.empresaId, filtro);
  }

  @Get(':id')
  findOne(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(sessao.empresaId, id);
  }

  /** Orçamento, pedido ou venda em PDF, para enviar ao cliente. */
  @Get(':id/pdf')
  async pdf(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const { nome, conteudo } = await this.service.pdf(sessao.empresaId, id, sessao.usuarioId);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${nome}"` });
    return new StreamableFile(conteudo);
  }

  @Post()
  @Perfis(...VENDEM)
  create(@SessaoAtual() sessao: Sessao, @Body() dto: CreateVendaDto) {
    return this.service.create(sessao.empresaId, dto);
  }

  @Patch(':id')
  @Perfis(...VENDEM)
  update(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVendaDto) {
    return this.service.update(sessao.empresaId, id, dto);
  }

  /** Orçamento aprovado pelo cliente vira pedido. */
  @Post(':id/aprovacao')
  @Perfis(...VENDEM)
  @HttpCode(200)
  aprovar(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.aprovar(sessao.empresaId, id);
  }

  /** Baixa o estoque e gera as contas a receber; a resposta traz avisos de estoque negativo. */
  @Post(':id/faturamento')
  @Perfis(...VENDEM)
  @HttpCode(200)
  faturar(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string, @Body() dto: FaturarVendaDto) {
    return this.service.faturar(sessao.empresaId, id, dto);
  }

  /** Vendas faturadas só podem ser canceladas por ADMIN e FINANCEIRO. */
  @Post(':id/cancelamento')
  @Perfis(...VENDEM)
  @HttpCode(200)
  cancelar(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.cancelar(sessao.empresaId, id, sessao.perfil);
  }
}

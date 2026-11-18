import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Perfis, SessaoAtual } from '../auth/auth.decorators';
import { Sessao } from '../auth/sessao';
import { Perfil } from '../usuarios/perfil.enum';
import { ApontamentoService } from './apontamento.service';
import { CreateEtapaObraDto, CreateEtapaPadraoDto, OrdemDto, UpdateEtapaObraDto, UpdateEtapaPadraoDto, UpdateObraDto } from './dto/apontamento.dto';
import { EtapasPadraoService } from './etapas-padrao.service';

/** Cadastro das etapas padrão; todos leem, administrador e financeiro alteram (como os Centros de Custo). */
@ApiTags('apontamento')
@ApiBearerAuth()
@Controller('etapas-padrao')
export class EtapasPadraoController {
  constructor(private readonly service: EtapasPadraoService) {}

  @Get()
  findAll(@SessaoAtual() sessao: Sessao) {
    return this.service.findAll(sessao.empresaId);
  }

  @Post()
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  create(@SessaoAtual() sessao: Sessao, @Body() dto: CreateEtapaPadraoDto) {
    return this.service.create(sessao.empresaId, dto);
  }

  /** Declarada antes de ":id" para "ordem" não ser lida como id. */
  @Put('ordem')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  reordenar(@SessaoAtual() sessao: Sessao, @Body() dto: OrdemDto) {
    return this.service.reordenar(sessao.empresaId, dto.ids);
  }

  @Patch(':id')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  update(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEtapaPadraoDto) {
    return this.service.update(sessao.empresaId, id, dto);
  }

  @Delete(':id')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  @HttpCode(204)
  remove(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(sessao.empresaId, id);
  }
}

/** Painel de apontamento: cada Centro de Custo ativo é uma obra. Todos leem; administrador e financeiro alteram. */
@ApiTags('apontamento')
@ApiBearerAuth()
@Controller('apontamento')
export class ApontamentoController {
  constructor(private readonly service: ApontamentoService) {}

  @Get()
  painel(@SessaoAtual() sessao: Sessao) {
    return this.service.painel(sessao.empresaId);
  }

  @Get(':id')
  obra(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.obra(sessao.empresaId, id);
  }

  /** Situação e observação da obra. */
  @Patch(':id')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  atualizar(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateObraDto) {
    return this.service.atualizarObra(sessao.empresaId, id, dto);
  }

  @Post(':id/etapas')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  incluirEtapa(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateEtapaObraDto) {
    return this.service.incluirEtapa(sessao.empresaId, id, dto);
  }

  /** Copia as etapas padrão ativas para uma obra sem etapas. */
  @Post(':id/etapas/padrao')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  aplicarPadrao(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.aplicarPadrao(sessao.empresaId, id);
  }

  @Put(':id/etapas/ordem')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  reordenar(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string, @Body() dto: OrdemDto) {
    return this.service.reordenarEtapas(sessao.empresaId, id, dto.ids);
  }

  @Patch(':id/etapas/:etapaId')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  atualizarEtapa(
    @SessaoAtual() sessao: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('etapaId', ParseUUIDPipe) etapaId: string,
    @Body() dto: UpdateEtapaObraDto,
  ) {
    return this.service.atualizarEtapa(sessao.empresaId, id, etapaId, dto);
  }

  @Delete(':id/etapas/:etapaId')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  excluirEtapa(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string, @Param('etapaId', ParseUUIDPipe) etapaId: string) {
    return this.service.excluirEtapa(sessao.empresaId, id, etapaId);
  }
}

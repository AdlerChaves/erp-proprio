import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Perfis, SessaoAtual } from '../auth/auth.decorators';
import { Sessao } from '../auth/sessao';
import { Perfil } from '../usuarios/perfil.enum';
import { AjusteEstoqueDto } from './dto/ajuste-estoque.dto';
import { FiltroMovimentacoesEstoqueDto } from './dto/filtro-movimentacoes-estoque.dto';
import { EstoqueService } from './estoque.service';

/** Consulta para todos os perfis (vendas precisa ver o disponível); ajustes só ADMIN e FINANCEIRO. */
@ApiTags('estoque')
@ApiBearerAuth()
@Controller('estoque')
export class EstoqueController {
  constructor(private readonly service: EstoqueService) {}

  @Get()
  posicao(@SessaoAtual() sessao: Sessao) {
    return this.service.posicao(sessao.empresaId);
  }

  @Get('movimentacoes')
  movimentacoes(@SessaoAtual() sessao: Sessao, @Query() filtro: FiltroMovimentacoesEstoqueDto) {
    return this.service.findMovimentacoes(sessao.empresaId, filtro);
  }

  @Post('ajustes')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  ajustar(@SessaoAtual() sessao: Sessao, @Body() dto: AjusteEstoqueDto) {
    return this.service.ajustar(sessao.empresaId, dto);
  }
}

import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Perfis, SessaoAtual } from '../auth/auth.decorators';
import { Sessao } from '../auth/sessao';
import { Perfil } from '../usuarios/perfil.enum';
import { CreateMovimentacaoDto } from './dto/create-movimentacao.dto';
import { ExtratoDto } from './dto/extrato.dto';
import { FiltroMovimentacaoDto } from './dto/filtro-movimentacao.dto';
import { SaldosDto } from './dto/saldos.dto';
import { TransferenciaDto } from './dto/transferencia.dto';
import { MovimentacoesService } from './movimentacoes.service';

/** Saldos e extratos são mais sensíveis que cadastros: o perfil VENDAS não acessa. */
@ApiTags('movimentacoes')
@ApiBearerAuth()
@Perfis(Perfil.ADMIN, Perfil.FINANCEIRO, Perfil.CONSULTA)
@Controller('movimentacoes')
export class MovimentacoesController {
  constructor(private readonly service: MovimentacoesService) {}

  @Get()
  findAll(@SessaoAtual() sessao: Sessao, @Query() filtro: FiltroMovimentacaoDto) {
    return this.service.findAll(sessao.empresaId, filtro);
  }

  @Get('saldos')
  saldos(@SessaoAtual() sessao: Sessao, @Query() filtro: SaldosDto) {
    return this.service.saldos(sessao.empresaId, filtro.data);
  }

  @Get('extrato')
  extrato(@SessaoAtual() sessao: Sessao, @Query() filtro: ExtratoDto) {
    return this.service.extrato(sessao.empresaId, filtro);
  }

  /** Movimentação avulsa (tarifa, rendimento, ajuste). */
  @Post()
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  criarAvulsa(@SessaoAtual() sessao: Sessao, @Body() dto: CreateMovimentacaoDto) {
    return this.service.criarAvulsa(sessao.empresaId, dto);
  }

  @Post('transferencias')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  transferir(@SessaoAtual() sessao: Sessao, @Body() dto: TransferenciaDto) {
    return this.service.transferir(sessao.empresaId, dto);
  }

  @Delete(':id')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  @HttpCode(204)
  remover(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remover(sessao.empresaId, id);
  }
}

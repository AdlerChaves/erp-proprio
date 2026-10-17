import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Perfis, SessaoAtual } from '../auth/auth.decorators';
import { Sessao } from '../auth/sessao';
import { BaixaDto } from '../financeiro/dto/baixa.dto';
import { UpdateContaDto } from '../financeiro/dto/dados-conta.dto';
import { Perfil } from '../usuarios/perfil.enum';
import { ContasPagarService } from './contas-pagar.service';
import { CreateContaPagarDto, CreateParcelamentoContaPagarDto } from './dto/create-conta-pagar.dto';
import { FiltroContaPagarDto } from './dto/filtro-conta-pagar.dto';

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

  /** Divide o valor em parcelas mensais. */
  @Post('parcelamentos')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  criarParcelamento(@SessaoAtual() sessao: Sessao, @Body() dto: CreateParcelamentoContaPagarDto) {
    return this.service.criarParcelamento(sessao.empresaId, dto);
  }

  @Patch(':id')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  update(
    @SessaoAtual() sessao: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContaDto,
  ) {
    return this.service.update(sessao.empresaId, id, dto);
  }

  /** Registra um pagamento total ou parcial. */
  @Post(':id/baixas')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  registrarBaixa(
    @SessaoAtual() sessao: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BaixaDto,
  ) {
    return this.service.registrarBaixa(sessao.empresaId, id, dto);
  }

  /** Estorna uma baixa e a movimentação bancária dela. */
  @Delete(':id/baixas/:baixaId')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  estornarBaixa(
    @SessaoAtual() sessao: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('baixaId', ParseUUIDPipe) baixaId: string,
  ) {
    return this.service.estornarBaixa(sessao.empresaId, id, baixaId);
  }

  @Post(':id/cancelamento')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  cancelar(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.cancelar(sessao.empresaId, id);
  }
}

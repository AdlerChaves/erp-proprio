import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Perfis, SessaoAtual } from '../auth/auth.decorators';
import { Sessao } from '../auth/sessao';
import { Perfil } from '../usuarios/perfil.enum';
import { SituacaoDespesa } from './despesa-recorrente.entity';
import { DespesasRecorrentesService } from './despesas-recorrentes.service';
import { CreateDespesaRecorrenteDto } from './dto/create-despesa-recorrente.dto';
import { FiltroDespesasDto, UpdateDespesaRecorrenteDto } from './dto/update-despesa-recorrente.dto';

const FINANCEIRO = [Perfil.ADMIN, Perfil.FINANCEIRO];

@ApiTags('despesas-recorrentes')
@ApiBearerAuth()
@Perfis(Perfil.ADMIN, Perfil.FINANCEIRO, Perfil.CONSULTA)
@Controller('despesas-recorrentes')
export class DespesasRecorrentesController {
  constructor(private readonly service: DespesasRecorrentesService) {}

  @Get()
  findAll(@SessaoAtual() sessao: Sessao, @Query() filtro: FiltroDespesasDto) {
    return this.service.findAll(sessao.empresaId, filtro);
  }

  @Get(':id')
  findOne(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(sessao.empresaId, id);
  }

  @Post()
  @Perfis(...FINANCEIRO)
  create(@SessaoAtual() sessao: Sessao, @Body() dto: CreateDespesaRecorrenteDto) {
    return this.service.create(sessao.empresaId, dto);
  }

  @Patch(':id')
  @Perfis(...FINANCEIRO)
  update(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDespesaRecorrenteDto) {
    return this.service.update(sessao.empresaId, id, dto);
  }

  /** Lança agora a próxima conta a pagar, sem esperar a antecedência. */
  @Post(':id/lancamento')
  @Perfis(...FINANCEIRO)
  @HttpCode(200)
  lancar(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.lancarProxima(sessao.empresaId, id);
  }

  @Post(':id/pausa')
  @Perfis(...FINANCEIRO)
  @HttpCode(200)
  pausar(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.mudarSituacao(sessao.empresaId, id, SituacaoDespesa.PAUSADA);
  }

  @Post(':id/reativacao')
  @Perfis(...FINANCEIRO)
  @HttpCode(200)
  reativar(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.mudarSituacao(sessao.empresaId, id, SituacaoDespesa.ATIVA);
  }

  @Post(':id/encerramento')
  @Perfis(...FINANCEIRO)
  @HttpCode(200)
  encerrar(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.mudarSituacao(sessao.empresaId, id, SituacaoDespesa.ENCERRADA);
  }

  @Delete(':id')
  @Perfis(Perfil.ADMIN)
  @HttpCode(204)
  remove(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(sessao.empresaId, id);
  }
}

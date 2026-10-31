import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Perfis, SessaoAtual } from '../auth/auth.decorators';
import { Sessao } from '../auth/sessao';
import { Perfil } from '../usuarios/perfil.enum';
import { SituacaoContrato } from './contrato.entity';
import { ContratosService } from './contratos.service';
import { CompetenciaDto } from './dto/competencia.dto';
import { CreateContratoDto } from './dto/create-contrato.dto';
import { FiltroContratosDto } from './dto/filtro-contratos.dto';
import { UpdateContratoDto } from './dto/update-contrato.dto';
import { GeracaoContratosService } from './geracao.service';

/** Gerar cobrança fatura vendas e emite notas fiscais: fica com quem cuida do financeiro e do fiscal. */
const FINANCEIRO = [Perfil.ADMIN, Perfil.FINANCEIRO];

@ApiTags('contratos')
@ApiBearerAuth()
@Controller('contratos')
export class ContratosController {
  constructor(
    private readonly service: ContratosService,
    private readonly geracao: GeracaoContratosService,
  ) {}

  @Get()
  findAll(@SessaoAtual() sessao: Sessao, @Query() filtro: FiltroContratosDto) {
    return this.service.findAll(sessao.empresaId, filtro);
  }

  /** Os contratos do mês e a situação da cobrança de cada um. */
  @Get('mes')
  mes(@SessaoAtual() sessao: Sessao, @Query() { competencia }: CompetenciaDto) {
    return this.geracao.mes(sessao.empresaId, competencia);
  }

  /** Gera agora as cobranças em aberto do mês (inclusive antecipando o dia do faturamento e retomando falhas). */
  @Post('geracoes')
  @Perfis(...FINANCEIRO)
  @HttpCode(200)
  async gerarPendentes(@SessaoAtual() sessao: Sessao, @Body() { competencia }: CompetenciaDto) {
    const resultado = await this.geracao.gerarPendentes(sessao.empresaId, competencia, { automatica: false });
    return { ...resultado, ...(await this.geracao.mes(sessao.empresaId, competencia)) };
  }

  @Get(':id')
  findOne(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(sessao.empresaId, id);
  }

  @Post()
  @Perfis(...FINANCEIRO)
  create(@SessaoAtual() sessao: Sessao, @Body() dto: CreateContratoDto) {
    return this.service.create(sessao.empresaId, dto);
  }

  @Patch(':id')
  @Perfis(...FINANCEIRO)
  update(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateContratoDto) {
    return this.service.update(sessao.empresaId, id, dto);
  }

  /** Gera (ou retoma, se falhou) a cobrança de um contrato numa competência. */
  @Post(':id/geracoes')
  @Perfis(...FINANCEIRO)
  @HttpCode(200)
  async gerar(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string, @Body() { competencia }: CompetenciaDto) {
    await this.geracao.gerar(sessao.empresaId, id, competencia);
    const { itens } = await this.geracao.mes(sessao.empresaId, competencia);
    return itens.find((i) => i.contrato.id === id) ?? null;
  }

  @Post(':id/pausa')
  @Perfis(...FINANCEIRO)
  @HttpCode(200)
  pausar(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.mudarSituacao(sessao.empresaId, id, SituacaoContrato.PAUSADO);
  }

  @Post(':id/reativacao')
  @Perfis(...FINANCEIRO)
  @HttpCode(200)
  reativar(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.mudarSituacao(sessao.empresaId, id, SituacaoContrato.ATIVO);
  }

  @Post(':id/encerramento')
  @Perfis(...FINANCEIRO)
  @HttpCode(200)
  encerrar(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.mudarSituacao(sessao.empresaId, id, SituacaoContrato.ENCERRADO);
  }

  @Delete(':id')
  @Perfis(Perfil.ADMIN)
  @HttpCode(204)
  remove(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(sessao.empresaId, id);
  }
}

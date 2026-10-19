import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Perfis, SessaoAtual } from '../auth/auth.decorators';
import { Sessao } from '../auth/sessao';
import { Perfil } from '../usuarios/perfil.enum';
import { CartoesService } from './cartoes.service';
import { AlterarDatasFaturaDto } from './dto/alterar-datas.dto';
import { CreateCartaoDto } from './dto/create-cartao.dto';
import { CreateLancamentoCartaoDto } from './dto/create-lancamento.dto';
import { UpdateCartaoDto } from './dto/update-cartao.dto';
import { UpdateLancamentoCartaoDto } from './dto/update-lancamento.dto';
import { ParseCompetenciaPipe } from './parse-competencia.pipe';

const ESCREVEM = [Perfil.ADMIN, Perfil.FINANCEIRO];

/** Cartões mostram gastos e limite: como saldos e extratos, o perfil VENDAS não acessa. */
@ApiTags('cartoes')
@ApiBearerAuth()
@Perfis(Perfil.ADMIN, Perfil.FINANCEIRO, Perfil.CONSULTA)
@Controller('cartoes')
export class CartoesController {
  constructor(private readonly service: CartoesService) {}

  @Get()
  findAll(@SessaoAtual() sessao: Sessao) {
    return this.service.findAll(sessao.empresaId);
  }

  @Get(':id')
  findOne(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(sessao.empresaId, id);
  }

  @Post()
  @Perfis(...ESCREVEM)
  create(@SessaoAtual() sessao: Sessao, @Body() dto: CreateCartaoDto) {
    return this.service.create(sessao.empresaId, dto);
  }

  @Patch(':id')
  @Perfis(...ESCREVEM)
  update(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCartaoDto) {
    return this.service.update(sessao.empresaId, id, dto);
  }

  @Delete(':id')
  @Perfis(Perfil.ADMIN)
  @HttpCode(204)
  remove(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(sessao.empresaId, id);
  }

  /** Fatura do mês de vencimento AAAA-MM, com lançamentos e total. */
  @Get(':id/faturas/:competencia')
  fatura(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string, @Param('competencia', ParseCompetenciaPipe) competencia: string) {
    return this.service.fatura(sessao.empresaId, id, competencia);
  }

  /** Ajusta fechamento e/ou vencimento de uma fatura aberta; as compras são redistribuídas. */
  @Patch(':id/faturas/:competencia')
  @Perfis(...ESCREVEM)
  alterarDatas(
    @SessaoAtual() sessao: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('competencia', ParseCompetenciaPipe) competencia: string,
    @Body() dto: AlterarDatasFaturaDto,
  ) {
    return this.service.alterarDatas(sessao.empresaId, id, competencia, dto);
  }

  @Post(':id/faturas/:competencia/fechamento')
  @Perfis(...ESCREVEM)
  @HttpCode(200)
  fechar(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string, @Param('competencia', ParseCompetenciaPipe) competencia: string) {
    return this.service.fechar(sessao.empresaId, id, competencia);
  }

  @Post(':id/faturas/:competencia/reabertura')
  @Perfis(...ESCREVEM)
  @HttpCode(200)
  reabrir(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string, @Param('competencia', ParseCompetenciaPipe) competencia: string) {
    return this.service.reabrir(sessao.empresaId, id, competencia);
  }

  @Post(':id/lancamentos')
  @Perfis(...ESCREVEM)
  lancar(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateLancamentoCartaoDto) {
    return this.service.lancar(sessao.empresaId, id, dto);
  }

  @Patch(':id/lancamentos/:lancamentoId')
  @Perfis(...ESCREVEM)
  alterarLancamento(
    @SessaoAtual() sessao: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lancamentoId', ParseUUIDPipe) lancamentoId: string,
    @Body() dto: UpdateLancamentoCartaoDto,
  ) {
    return this.service.alterarLancamento(sessao.empresaId, id, lancamentoId, dto);
  }

  /** Exclui a compra inteira, com todas as parcelas. */
  @Delete(':id/lancamentos/:lancamentoId')
  @Perfis(...ESCREVEM)
  @HttpCode(204)
  excluirLancamento(
    @SessaoAtual() sessao: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lancamentoId', ParseUUIDPipe) lancamentoId: string,
  ) {
    return this.service.excluirLancamento(sessao.empresaId, id, lancamentoId);
  }
}

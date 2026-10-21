import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Perfis, SessaoAtual } from '../auth/auth.decorators';
import { Sessao } from '../auth/sessao';
import { Perfil } from '../usuarios/perfil.enum';
import { ConciliacaoService } from './conciliacao.service';
import { BaixarContaDto, ConciliarLinhaDto, LancarAvulsaDto } from './dto/acoes-linha.dto';
import { FiltroConciliacaoDto } from './dto/filtro-conciliacao.dto';
import { ImportarOfxDto } from './dto/importar-ofx.dto';

const ESCREVEM = [Perfil.ADMIN, Perfil.FINANCEIRO];

/** Conciliação do extrato do banco (OFX) com as movimentações do sistema. VENDAS não acessa, como nos saldos. */
@ApiTags('conciliacao')
@ApiBearerAuth()
@Perfis(Perfil.ADMIN, Perfil.FINANCEIRO, Perfil.CONSULTA)
@Controller('conciliacao')
export class ConciliacaoController {
  constructor(private readonly service: ConciliacaoService) {}

  /** Linhas do banco no período, sugestões, movimentações sem par e saldo do banco × sistema. */
  @Get()
  painel(@SessaoAtual() sessao: Sessao, @Query() filtro: FiltroConciliacaoDto) {
    return this.service.painel(sessao.empresaId, filtro);
  }

  /** Importa um arquivo OFX (base64); transações já importadas são ignoradas. */
  @Post('importacoes')
  @Perfis(...ESCREVEM)
  importar(@SessaoAtual() sessao: Sessao, @Body() dto: ImportarOfxDto) {
    return this.service.importar(sessao.empresaId, dto);
  }

  /** Concilia sozinho as linhas pendentes que têm um único par no sistema. */
  @Post('automatica/:contaBancariaId')
  @Perfis(...ESCREVEM)
  @HttpCode(200)
  async automatica(@SessaoAtual() sessao: Sessao, @Param('contaBancariaId', ParseUUIDPipe) contaBancariaId: string) {
    return { conciliadas: await this.service.conciliarAutomaticamente(sessao.empresaId, contaBancariaId) };
  }

  @Post('linhas/:id/conciliacao')
  @Perfis(...ESCREVEM)
  @HttpCode(200)
  conciliar(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConciliarLinhaDto) {
    return this.service.conciliar(sessao.empresaId, id, dto);
  }

  /** Desfaz a conciliação (ou o "ignorar"); a movimentação do sistema continua existindo. */
  @Delete('linhas/:id/conciliacao')
  @Perfis(...ESCREVEM)
  desfazer(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.desfazer(sessao.empresaId, id);
  }

  @Post('linhas/:id/ignorar')
  @Perfis(...ESCREVEM)
  @HttpCode(200)
  ignorar(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.ignorar(sessao.empresaId, id);
  }

  /** Cria a movimentação avulsa da linha (tarifa, rendimento) e concilia. */
  @Post('linhas/:id/avulsa')
  @Perfis(...ESCREVEM)
  lancarAvulsa(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LancarAvulsaDto) {
    return this.service.lancarAvulsa(sessao.empresaId, id, dto);
  }

  /** Baixa uma conta a receber (entrada) ou a pagar (saída) com o valor e a data da linha, e concilia. */
  @Post('linhas/:id/baixa')
  @Perfis(...ESCREVEM)
  baixarConta(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BaixarContaDto) {
    return this.service.baixarConta(sessao.empresaId, id, dto);
  }
}

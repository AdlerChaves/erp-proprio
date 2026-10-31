import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Perfis, SessaoAtual } from '../auth/auth.decorators';
import { Sessao } from '../auth/sessao';
import { Perfil } from '../usuarios/perfil.enum';
import { DreDto, ResumoCentroCustoDto } from './dto/dre.dto';
import { FluxoCaixaDto } from './dto/fluxo-caixa.dto';
import { ProjecaoDto } from './dto/projecao.dto';
import { ProjecaoService } from './projecao.service';
import { RelatoriosService } from './relatorios.service';

@ApiTags('financeiro')
@ApiBearerAuth()
@Perfis(Perfil.ADMIN, Perfil.FINANCEIRO, Perfil.CONSULTA)
@Controller('financeiro')
export class RelatoriosController {
  constructor(
    private readonly service: RelatoriosService,
    private readonly projecaoService: ProjecaoService,
  ) {}

  @Get('fluxo-caixa')
  fluxoCaixa(@SessaoAtual() sessao: Sessao, @Query() filtro: FluxoCaixaDto) {
    return this.service.fluxoCaixa(sessao.empresaId, filtro);
  }

  /** Saldo projetado dia a dia até `ate`, com o que entra e sai em cada dia e as contas vencidas à parte. */
  @Get('projecao')
  projecao(@SessaoAtual() sessao: Sessao, @Query() dto: ProjecaoDto) {
    return this.projecaoService.projecao(sessao.empresaId, dto);
  }

  @Get('dre')
  dre(@SessaoAtual() sessao: Sessao, @Query() filtro: DreDto) {
    return this.service.dre(sessao.empresaId, filtro);
  }

  /** Resultado de um centro de custo no período: categorias, lançamentos e o que ainda está em aberto. */
  @Get('centros-custo/:id/resumo')
  resumoCentroCusto(
    @SessaoAtual() sessao: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() filtro: ResumoCentroCustoDto,
  ) {
    return this.service.resumoCentroCusto(sessao.empresaId, id, filtro);
  }
}

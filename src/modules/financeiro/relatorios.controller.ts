import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Perfis, SessaoAtual } from '../auth/auth.decorators';
import { Sessao } from '../auth/sessao';
import { Perfil } from '../usuarios/perfil.enum';
import { DreDto } from './dto/dre.dto';
import { FluxoCaixaDto } from './dto/fluxo-caixa.dto';
import { RelatoriosService } from './relatorios.service';

@ApiTags('financeiro')
@ApiBearerAuth()
@Perfis(Perfil.ADMIN, Perfil.FINANCEIRO, Perfil.CONSULTA)
@Controller('financeiro')
export class RelatoriosController {
  constructor(private readonly service: RelatoriosService) {}

  @Get('fluxo-caixa')
  fluxoCaixa(@SessaoAtual() sessao: Sessao, @Query() filtro: FluxoCaixaDto) {
    return this.service.fluxoCaixa(sessao.empresaId, filtro);
  }

  @Get('dre')
  dre(@SessaoAtual() sessao: Sessao, @Query() filtro: DreDto) {
    return this.service.dre(sessao.empresaId, filtro);
  }
}

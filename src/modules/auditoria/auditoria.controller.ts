import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Perfis, SessaoAtual } from '../auth/auth.decorators';
import { Sessao } from '../auth/sessao';
import { Perfil } from '../usuarios/perfil.enum';
import { AuditoriaService } from './auditoria.service';
import { FiltroAuditoriaDto } from './dto/filtro-auditoria.dto';

@ApiTags('auditoria')
@ApiBearerAuth()
@Perfis(Perfil.ADMIN)
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly service: AuditoriaService) {}

  /** Mais recentes primeiro, paginado por limite e deslocamento. */
  @Get()
  findAll(@SessaoAtual() sessao: Sessao, @Query() filtro: FiltroAuditoriaDto) {
    return this.service.findAll(sessao.empresaId, filtro);
  }
}

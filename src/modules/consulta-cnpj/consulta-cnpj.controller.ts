import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ConsultaCnpjService } from './consulta-cnpj.service';

/** Dados públicos do CNPJ (Receita Federal) para preencher cadastros. Qualquer usuário logado pode consultar. */
@ApiTags('cnpj')
@ApiBearerAuth()
@Controller('cnpj')
export class ConsultaCnpjController {
  constructor(private readonly service: ConsultaCnpjService) {}

  /** Limite próprio por IP, para não esgotar as fontes gratuitas. */
  @Get(':cnpj')
  @Throttle({ default: { limit: () => Number(process.env.THROTTLE_CNPJ_LIMITE ?? 30), ttl: 60_000 } })
  consultar(@Param('cnpj') cnpj: string) {
    return this.service.consultar(cnpj);
  }
}

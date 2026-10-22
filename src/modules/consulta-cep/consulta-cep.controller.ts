import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ConsultaCepService } from './consulta-cep.service';

/** Endereço pelo CEP para preencher cadastros. Qualquer usuário logado pode consultar. */
@ApiTags('cep')
@ApiBearerAuth()
@Controller('cep')
export class ConsultaCepController {
  constructor(private readonly service: ConsultaCepService) {}

  /** Limite próprio por IP, para não esgotar as fontes gratuitas. */
  @Get(':cep')
  @Throttle({ default: { limit: () => Number(process.env.THROTTLE_CEP_LIMITE ?? 60), ttl: 60_000 } })
  consultar(@Param('cep') cep: string) {
    return this.service.consultar(cep);
  }
}

import { PartialType } from '@nestjs/swagger';
import { CreateContratoDto } from './create-contrato.dto';

/** Vale para as próximas cobranças; as já geradas não mudam. Itens, se enviados, substituem todos os anteriores. */
export class UpdateContratoDto extends PartialType(CreateContratoDto) {}

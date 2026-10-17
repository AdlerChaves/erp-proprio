import { OmitType, PartialType } from '@nestjs/swagger';
import { CreatePlanoContaDto } from './create-plano-conta.dto';

/** Tipo e conta pai não mudam depois de criados. */
export class UpdatePlanoContaDto extends PartialType(
  OmitType(CreatePlanoContaDto, ['tipo', 'contaPaiId'] as const),
) {}

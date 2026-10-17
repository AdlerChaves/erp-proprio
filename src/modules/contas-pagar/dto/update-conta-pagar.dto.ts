import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateContaPagarDto } from './create-conta-pagar.dto';

export class UpdateContaPagarDto extends PartialType(
  OmitType(CreateContaPagarDto, ['fornecedorId'] as const),
) {}

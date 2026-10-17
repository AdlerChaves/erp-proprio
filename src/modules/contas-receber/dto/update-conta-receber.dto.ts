import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateContaReceberDto } from './create-conta-receber.dto';

export class UpdateContaReceberDto extends PartialType(
  OmitType(CreateContaReceberDto, ['clienteId'] as const),
) {}

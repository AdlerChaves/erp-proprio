import { IsOptional, IsUUID } from 'class-validator';
import { FiltroContasDto } from '../../financeiro/dto/filtro-contas.dto';

export class FiltroContaReceberDto extends FiltroContasDto {
  @IsOptional()
  @IsUUID()
  clienteId?: string;
}

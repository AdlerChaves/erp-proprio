import { IsOptional, IsUUID } from 'class-validator';
import { FiltroContasDto } from '../../financeiro/dto/filtro-contas.dto';

export class FiltroContaPagarDto extends FiltroContasDto {
  @IsOptional()
  @IsUUID()
  fornecedorId?: string;
}

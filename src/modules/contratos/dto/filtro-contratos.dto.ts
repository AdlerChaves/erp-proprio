import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { SituacaoContrato } from '../contrato.entity';

export class FiltroContratosDto {
  @IsOptional()
  @IsEnum(SituacaoContrato)
  situacao?: SituacaoContrato;

  @IsOptional()
  @IsUUID()
  clienteId?: string;
}

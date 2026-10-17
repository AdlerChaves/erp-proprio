import { IsEnum, IsOptional } from 'class-validator';
import { TipoPlanoConta } from '../plano-conta.entity';

export class FiltroPlanoContaDto {
  @IsOptional()
  @IsEnum(TipoPlanoConta)
  tipo?: TipoPlanoConta;
}

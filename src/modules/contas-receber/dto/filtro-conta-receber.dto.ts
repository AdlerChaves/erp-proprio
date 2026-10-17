import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { StatusContaReceber } from '../conta-receber.entity';

export class FiltroContaReceberDto {
  @IsOptional()
  @IsUUID()
  clienteId?: string;

  @IsOptional()
  @IsUUID()
  planoContaId?: string;

  @IsOptional()
  @IsUUID()
  centroCustoId?: string;

  @IsOptional()
  @IsEnum(StatusContaReceber)
  status?: StatusContaReceber;

  @IsOptional()
  @IsDateString({ strict: true })
  vencimentoDe?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  vencimentoAte?: string;
}

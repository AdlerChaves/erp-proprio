import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { StatusConta } from '../status-conta.enum';

/** Filtros comuns às listagens de contas a receber e a pagar. */
export class FiltroContasDto {
  @IsOptional()
  @IsUUID()
  planoContaId?: string;

  @IsOptional()
  @IsUUID()
  centroCustoId?: string;

  @IsOptional()
  @IsUUID()
  parcelamentoId?: string;

  @IsOptional()
  @IsEnum(StatusConta)
  status?: StatusConta;

  @IsOptional()
  @IsDateString({ strict: true })
  vencimentoDe?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  vencimentoAte?: string;
}

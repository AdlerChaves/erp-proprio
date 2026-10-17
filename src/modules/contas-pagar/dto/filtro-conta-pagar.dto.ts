import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { StatusContaPagar } from '../conta-pagar.entity';

export class FiltroContaPagarDto {
  @IsOptional()
  @IsUUID()
  fornecedorId?: string;

  @IsOptional()
  @IsUUID()
  planoContaId?: string;

  @IsOptional()
  @IsUUID()
  centroCustoId?: string;

  @IsOptional()
  @IsEnum(StatusContaPagar)
  status?: StatusContaPagar;

  @IsOptional()
  @IsDateString({ strict: true })
  vencimentoDe?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  vencimentoAte?: string;
}

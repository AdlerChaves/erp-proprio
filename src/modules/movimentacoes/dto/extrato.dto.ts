import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class ExtratoDto {
  @IsUUID()
  contaBancariaId: string;

  /** Padrão: data do saldo inicial da conta. */
  @IsOptional()
  @IsDateString({ strict: true })
  de?: string;

  /** Padrão: hoje. */
  @IsOptional()
  @IsDateString({ strict: true })
  ate?: string;
}

import { IsDateString, IsOptional } from 'class-validator';

export class SaldosDto {
  /** Saldo ao fim deste dia. Padrão: hoje. */
  @IsOptional()
  @IsDateString({ strict: true })
  data?: string;
}

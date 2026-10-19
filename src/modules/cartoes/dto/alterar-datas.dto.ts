import { IsDateString, IsOptional } from 'class-validator';

/** Ajuste das datas de uma fatura para bater com o banco (fim de semana, feriado). */
export class AlterarDatasFaturaDto {
  @IsOptional()
  @IsDateString({ strict: true })
  dataFechamento?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  dataVencimento?: string;
}

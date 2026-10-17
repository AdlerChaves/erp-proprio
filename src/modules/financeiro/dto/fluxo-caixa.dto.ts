import { IsDateString, IsIn, IsOptional } from 'class-validator';

export class FluxoCaixaDto {
  @IsDateString({ strict: true })
  de: string;

  @IsDateString({ strict: true })
  ate: string;

  /** Padrão: mes. Por dia, o período é limitado a 366 dias. */
  @IsOptional()
  @IsIn(['dia', 'mes'])
  agrupamento?: 'dia' | 'mes';
}

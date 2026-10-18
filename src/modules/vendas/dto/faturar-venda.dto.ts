import { IsDateString, IsOptional } from 'class-validator';

export class FaturarVendaDto {
  /** Data do faturamento, que é a emissão das contas a receber e a data da saída do estoque. Padrão: hoje. */
  @IsOptional()
  @IsDateString({ strict: true })
  data?: string;
}

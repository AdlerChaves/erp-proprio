import { IsDateString, IsOptional } from 'class-validator';

export class ReceberCompraDto {
  /** Data em que a mercadoria chegou: entrada no estoque e emissão das contas a pagar. Padrão: hoje. */
  @IsOptional()
  @IsDateString({ strict: true })
  data?: string;
}

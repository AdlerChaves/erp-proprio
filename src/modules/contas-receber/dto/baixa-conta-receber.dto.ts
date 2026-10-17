import { IsDateString, IsNumber, IsOptional, IsPositive } from 'class-validator';

export class BaixaContaReceberDto {
  /** Padrão: valor da conta. Pode diferir por juros ou desconto. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valorPago?: number;

  /** Padrão: data de hoje. */
  @IsOptional()
  @IsDateString({ strict: true })
  dataPagamento?: string;
}

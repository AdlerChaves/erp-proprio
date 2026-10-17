import { IsDateString, IsNumber, IsOptional, IsPositive, IsUUID } from 'class-validator';

export class BaixaContaReceberDto {
  /** Conta bancária ou caixa onde o dinheiro entrou. */
  @IsUUID()
  contaBancariaId: string;

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

import { IsDateString, IsNumber, IsOptional, IsPositive, IsUUID, Min } from 'class-validator';

export class BaixaDto {
  /** Conta bancária ou caixa onde o dinheiro entrou ou de onde saiu. */
  @IsUUID()
  contaBancariaId: string;

  /** Principal abatido do saldo. Padrão: todo o saldo em aberto. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valor?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  juros?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  multa?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  desconto?: number;

  /** Padrão: hoje. */
  @IsOptional()
  @IsDateString({ strict: true })
  data?: string;
}

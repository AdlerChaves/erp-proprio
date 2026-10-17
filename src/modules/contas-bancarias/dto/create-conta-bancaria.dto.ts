import { IsBoolean, IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, Length, Matches } from 'class-validator';
import { TipoContaBancaria } from '../conta-bancaria.entity';

export class CreateContaBancariaDto {
  @IsNotEmpty()
  @Length(1, 100)
  nome: string;

  @IsEnum(TipoContaBancaria)
  tipo: TipoContaBancaria;

  /** Obrigatório exceto para CAIXA. */
  @IsOptional()
  @Matches(/^\d{3}$/, { message: 'banco deve ser o código de 3 dígitos' })
  banco?: string;

  /** Obrigatória exceto para CAIXA. */
  @IsOptional()
  @Length(1, 10)
  agencia?: string;

  /** Obrigatório exceto para CAIXA. */
  @IsOptional()
  @Length(1, 20)
  numero?: string;

  /** Pode ser negativo (conta no cheque especial). */
  @IsNumber({ maxDecimalPlaces: 2 })
  saldoInicial: number;

  /** Padrão: data de hoje. */
  @IsOptional()
  @IsDateString({ strict: true })
  dataSaldoInicial?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

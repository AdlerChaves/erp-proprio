import { IsDateString, IsNumber, IsOptional, IsPositive, IsUUID, Length } from 'class-validator';

export class TransferenciaDto {
  @IsUUID()
  contaOrigemId: string;

  @IsUUID()
  contaDestinoId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valor: number;

  /** Padrão: hoje. */
  @IsOptional()
  @IsDateString({ strict: true })
  data?: string;

  /** Padrão: "Transferência entre contas". */
  @IsOptional()
  @Length(1, 255)
  descricao?: string;
}

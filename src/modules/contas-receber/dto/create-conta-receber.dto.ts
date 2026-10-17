import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsUUID, Length } from 'class-validator';

export class CreateContaReceberDto {
  @IsUUID()
  clienteId: string;

  @IsNotEmpty()
  @Length(1, 255)
  descricao: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valor: number;

  /** Padrão: data de hoje. */
  @IsOptional()
  @IsDateString({ strict: true })
  dataEmissao?: string;

  @IsDateString({ strict: true })
  dataVencimento: string;

  /** Categoria de receita analítica e ativa. Envie null na alteração para remover. */
  @IsOptional()
  @IsUUID()
  planoContaId?: string | null;

  /** Envie null na alteração para remover. */
  @IsOptional()
  @IsUUID()
  centroCustoId?: string | null;
}

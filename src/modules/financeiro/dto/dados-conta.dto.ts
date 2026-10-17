import { PartialType } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsUUID, Length } from 'class-validator';

/** Campos comuns a contas a receber e a pagar. */
export class DadosContaDto {
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

  /** Categoria analítica e ativa do tipo da conta. Envie null na alteração para remover. */
  @IsOptional()
  @IsUUID()
  planoContaId?: string | null;

  /** Envie null na alteração para remover. */
  @IsOptional()
  @IsUUID()
  centroCustoId?: string | null;
}

/** O cliente ou fornecedor não muda depois de criada a conta. */
export class UpdateContaDto extends PartialType(DadosContaDto) {}

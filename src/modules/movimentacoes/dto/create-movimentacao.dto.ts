import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsUUID, Length } from 'class-validator';
import { TipoMovimentacao } from '../movimentacao-bancaria.entity';

/** Movimentação avulsa: tarifa, rendimento, ajuste. */
export class CreateMovimentacaoDto {
  @IsUUID()
  contaBancariaId: string;

  @IsEnum(TipoMovimentacao)
  tipo: TipoMovimentacao;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valor: number;

  /** Padrão: hoje. */
  @IsOptional()
  @IsDateString({ strict: true })
  data?: string;

  @IsNotEmpty()
  @Length(1, 255)
  descricao: string;

  /** Categoria de receita (entrada) ou de despesa (saída), analítica e ativa. */
  @IsOptional()
  @IsUUID()
  planoContaId?: string;

  @IsOptional()
  @IsUUID()
  centroCustoId?: string;
}

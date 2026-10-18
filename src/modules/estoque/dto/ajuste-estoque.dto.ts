import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsUUID, Length, Min } from 'class-validator';
import { TipoMovimentacaoEstoque } from '../movimentacao-estoque.entity';

/** Entrada ou saída lançada à mão: inventário, perda, quebra, doação. */
export class AjusteEstoqueDto {
  @IsUUID()
  produtoId: string;

  @IsEnum(TipoMovimentacaoEstoque)
  tipo: TipoMovimentacaoEstoque;

  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantidade: number;

  /** Só na entrada: custo por unidade, que entra no custo médio. Padrão: o custo médio atual. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  custoUnitario?: number;

  /** Padrão: hoje. */
  @IsOptional()
  @IsDateString({ strict: true })
  data?: string;

  /** Ex.: "Inventário de outubro", "Quebra no transporte". */
  @IsNotEmpty()
  @Length(1, 255)
  motivo: string;
}

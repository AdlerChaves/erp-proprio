import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ItemCompraDto {
  @IsUUID()
  produtoId: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantidade: number;

  /** Custo por unidade nesta compra. Padrão: o custo médio atual do produto. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  custoUnitario?: number;
}

export class CreateCompraDto {
  @IsUUID()
  fornecedorId: string;

  /** Padrão: hoje. */
  @IsOptional()
  @IsDateString({ strict: true })
  dataEmissao?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ItemCompraDto)
  itens: ItemCompraDto[];

  /** Parcelas mensais das contas a pagar. Padrão: 1. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  parcelas?: number;

  /** Padrão: no dia do recebimento (à vista). Envie null na alteração para voltar ao padrão. */
  @IsOptional()
  @IsDateString({ strict: true })
  primeiroVencimento?: string | null;

  /** Categoria de despesa das contas a pagar, como 2.01.01 Compras de mercadorias. */
  @IsOptional()
  @IsUUID()
  planoContaId?: string | null;

  @IsOptional()
  @IsUUID()
  centroCustoId?: string | null;

  @IsOptional()
  @Length(0, 500)
  observacoes?: string | null;
}

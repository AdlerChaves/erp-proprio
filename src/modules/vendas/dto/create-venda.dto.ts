import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
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
import { EscopoServico, StatusVenda } from '../venda.entity';

export class ItemVendaDto {
  @IsUUID()
  produtoId: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantidade: number;

  /** Padrão: o preço de venda do cadastro. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precoUnitario?: number;

  /** Desconto em reais sobre o total do item. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  desconto?: number;
}

export class CreateVendaDto {
  @IsUUID()
  clienteId: string;

  /** ORCAMENTO (padrão) ou PEDIDO, para quem já fecha a venda direto. */
  @IsOptional()
  @IsIn([StatusVenda.ORCAMENTO, StatusVenda.PEDIDO])
  status?: StatusVenda.ORCAMENTO | StatusVenda.PEDIDO;

  /** Padrão: hoje. */
  @IsOptional()
  @IsDateString({ strict: true })
  dataEmissao?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ItemVendaDto)
  itens: ItemVendaDto[];

  /** Parcelas mensais das contas a receber. Padrão: 1. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  parcelas?: number;

  /** Padrão: no dia do faturamento (à vista). Envie null na alteração para voltar ao padrão. */
  @IsOptional()
  @IsDateString({ strict: true })
  primeiroVencimento?: string | null;

  /** Categoria de receita das contas a receber. Envie null na alteração para remover. */
  @IsOptional()
  @IsUUID()
  planoContaId?: string | null;

  @IsOptional()
  @IsUUID()
  centroCustoId?: string | null;

  @IsOptional()
  @Length(0, 500)
  observacoes?: string | null;

  /** Só mão de obra ou material com mão de obra inclusa. Envie null na alteração para não informar. */
  @IsOptional()
  @IsEnum(EscopoServico)
  escopoServico?: EscopoServico | null;

  /** Padrão: true. */
  @IsOptional()
  @IsBoolean()
  exibirParcelamento?: boolean;
}

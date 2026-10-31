import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/** Competência no formato AAAA-MM. */
export const COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;
export const MENSAGEM_COMPETENCIA = 'deve ser um mês no formato AAAA-MM';

export class ItemContratoDto {
  @IsUUID()
  produtoId: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantidade: number;

  /** Padrão: o preço de venda do cadastro, que fica fixado no contrato. */
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

export class CreateContratoDto {
  @IsUUID()
  clienteId: string;

  @IsNotEmpty()
  @Length(1, 120)
  descricao: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ItemContratoDto)
  itens: ItemContratoDto[];

  @Matches(COMPETENCIA, { message: `inicio ${MENSAGEM_COMPETENCIA}` })
  inicio: string;

  /** Última competência; envie null para não ter fim. */
  @IsOptional()
  @Matches(COMPETENCIA, { message: `fim ${MENSAGEM_COMPETENCIA}` })
  fim?: string | null;

  @IsInt()
  @Min(1)
  @Max(28)
  diaFaturamento: number;

  @IsInt()
  @Min(1)
  @Max(28)
  diaVencimento: number;

  /** Padrão: false. */
  @IsOptional()
  @IsBoolean()
  emitirNfse?: boolean;

  /** Padrão: false; exige emitirNfse. */
  @IsOptional()
  @IsBoolean()
  transmitirNfse?: boolean;

  @IsOptional()
  @IsUUID()
  planoContaId?: string | null;

  @IsOptional()
  @IsUUID()
  centroCustoId?: string | null;

  @IsOptional()
  @Length(0, 300)
  observacoes?: string | null;
}

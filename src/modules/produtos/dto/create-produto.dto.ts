import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Length,
  Matches,
  Min,
} from 'class-validator';
import { TipoProduto } from '../produto.entity';

export class CreateProdutoDto {
  @IsNotEmpty()
  @Length(1, 60)
  codigo: string;

  @IsNotEmpty()
  @Length(1, 255)
  descricao: string;

  @IsEnum(TipoProduto)
  tipo: TipoProduto;

  /** Ex.: UN, KG, M, H. */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Length(1, 6)
  unidade: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precoVenda: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  custo?: number;

  @IsOptional()
  @Matches(/^\d{8}$/, { message: 'ncm deve ter 8 dígitos' })
  ncm?: string;

  @IsOptional()
  @Matches(/^\d{2}\.\d{2}$/, { message: 'codigoServico deve estar no formato 00.00 (LC 116)' })
  codigoServico?: string;

  /** Só serviços: código de tributação nacional da NFS-e (6 dígitos, lista nacional), como 010701. */
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'codigoTributacaoNacional deve ter 6 dígitos' })
  codigoTributacaoNacional?: string | null;

  /** Só serviços: código NBS (9 dígitos). */
  @IsOptional()
  @Matches(/^\d{9}$/, { message: 'codigoNbs deve ter 9 dígitos' })
  codigoNbs?: string | null;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

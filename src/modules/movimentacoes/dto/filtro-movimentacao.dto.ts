import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { OrigemMovimentacao, TipoMovimentacao } from '../movimentacao-bancaria.entity';

export class FiltroMovimentacaoDto {
  @IsOptional()
  @IsUUID()
  contaBancariaId?: string;

  @IsOptional()
  @IsEnum(TipoMovimentacao)
  tipo?: TipoMovimentacao;

  @IsOptional()
  @IsEnum(OrigemMovimentacao)
  origem?: OrigemMovimentacao;

  @IsOptional()
  @IsDateString({ strict: true })
  de?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  ate?: string;
}

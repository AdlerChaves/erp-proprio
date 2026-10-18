import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class FiltroMovimentacoesEstoqueDto {
  @IsOptional()
  @IsUUID()
  produtoId?: string;

  @IsOptional()
  @IsUUID()
  vendaId?: string;

  @IsOptional()
  @IsUUID()
  compraId?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  de?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  ate?: string;
}

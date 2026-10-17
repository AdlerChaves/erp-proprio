import { IsEnum, IsOptional } from 'class-validator';
import { TipoProduto } from '../produto.entity';

export class FiltroProdutoDto {
  @IsOptional()
  @IsEnum(TipoProduto)
  tipo?: TipoProduto;
}

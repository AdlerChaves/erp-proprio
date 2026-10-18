import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { StatusCompra } from '../compra.entity';

export class FiltroComprasDto {
  @IsOptional()
  @IsEnum(StatusCompra)
  status?: StatusCompra;

  @IsOptional()
  @IsUUID()
  fornecedorId?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  de?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  ate?: string;
}

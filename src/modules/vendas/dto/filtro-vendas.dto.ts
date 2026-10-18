import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { StatusVenda } from '../venda.entity';

export class FiltroVendasDto {
  @IsOptional()
  @IsEnum(StatusVenda)
  status?: StatusVenda;

  @IsOptional()
  @IsUUID()
  clienteId?: string;

  /** Data de emissão a partir de. */
  @IsOptional()
  @IsDateString({ strict: true })
  de?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  ate?: string;
}

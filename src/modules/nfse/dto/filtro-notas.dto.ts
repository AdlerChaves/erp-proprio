import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { StatusNotaServico } from '../nota-servico.entity';

export class FiltroNotasServicoDto {
  @IsOptional()
  @IsEnum(StatusNotaServico)
  status?: StatusNotaServico;

  @IsOptional()
  @IsUUID()
  vendaId?: string;

  @IsOptional()
  @IsUUID()
  clienteId?: string;

  /** Data de competência a partir de. */
  @IsOptional()
  @IsDateString({ strict: true })
  de?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  ate?: string;
}

import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsUUID, Length, Max, Min } from 'class-validator';

export class FiltroAuditoriaDto {
  @IsOptional()
  @IsUUID()
  usuarioId?: string;

  /** Ex.: contas-receber. */
  @IsOptional()
  @Length(1, 60)
  recurso?: string;

  @IsOptional()
  @IsUUID()
  recursoId?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  de?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  ate?: string;

  /** Padrão: 50; máximo: 200. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limite?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  deslocamento?: number;
}

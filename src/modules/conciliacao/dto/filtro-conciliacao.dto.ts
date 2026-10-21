import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class FiltroConciliacaoDto {
  @IsUUID()
  contaBancariaId: string;

  @IsOptional()
  @IsDateString({ strict: true })
  de?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  ate?: string;
}

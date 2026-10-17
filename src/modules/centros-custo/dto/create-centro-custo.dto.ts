import { IsBoolean, IsNotEmpty, IsOptional, Length } from 'class-validator';

export class CreateCentroCustoDto {
  @IsNotEmpty()
  @Length(1, 100)
  nome: string;

  @IsOptional()
  @Length(1, 255)
  descricao?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

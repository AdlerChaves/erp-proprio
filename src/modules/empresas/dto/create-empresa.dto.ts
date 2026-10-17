import { IsNotEmpty, IsOptional, Length, Matches } from 'class-validator';

export class CreateEmpresaDto {
  @IsNotEmpty()
  @Length(1, 150)
  razaoSocial: string;

  @IsOptional()
  @Length(1, 150)
  nomeFantasia?: string;

  @Matches(/^\d{14}$/, { message: 'cnpj deve ter 14 dígitos, sem pontuação' })
  cnpj: string;
}

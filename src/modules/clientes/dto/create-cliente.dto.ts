import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, Length, Matches } from 'class-validator';

export class CreateClienteDto {
  @IsNotEmpty()
  @Length(1, 150)
  nome: string;

  @Matches(/^(\d{11}|\d{14})$/, { message: 'documento deve ser CPF (11) ou CNPJ (14) só com dígitos' })
  documento: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @Length(8, 20)
  telefone?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

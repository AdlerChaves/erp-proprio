import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, Length, Matches, ValidateNested } from 'class-validator';
import { EnderecoDto } from '../../../common/endereco.dto';

export class CreateClienteDto {
  @IsNotEmpty()
  @Length(1, 150)
  nome: string;

  /** Opcional enquanto o cliente não enviou os documentos; obrigatório para a nota de serviço. Envie null para limpar. */
  @IsOptional()
  @Matches(/^(\d{11}|\d{14})$/, { message: 'documento deve ser CPF (11) ou CNPJ (14) só com dígitos' })
  documento?: string | null;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @Length(8, 20)
  telefone?: string;

  /** Inscrição municipal do tomador, se houver. Envie null para limpar. */
  @IsOptional()
  @Length(1, 15)
  inscricaoMunicipal?: string | null;

  /** Endereço no Brasil, usado na nota de serviço. Envie null para limpar. */
  @IsOptional()
  @ValidateNested()
  @Type(() => EnderecoDto)
  endereco?: EnderecoDto | null;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

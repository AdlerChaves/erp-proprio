import { Type } from 'class-transformer';
import { IsEmail, IsNotEmpty, Length, ValidateNested } from 'class-validator';
import { CreateEmpresaDto } from '../../empresas/dto/create-empresa.dto';
import { NormalizarEmail } from '../../usuarios/dto/email.transform';

export class NovoUsuarioDto {
  @IsNotEmpty()
  @Length(1, 150)
  nome: string;

  @NormalizarEmail()
  @IsEmail()
  email: string;

  @Length(8, 72)
  senha: string;
}

export class RegistrarDto {
  @ValidateNested()
  @Type(() => CreateEmpresaDto)
  empresa: CreateEmpresaDto;

  @ValidateNested()
  @Type(() => NovoUsuarioDto)
  usuario: NovoUsuarioDto;
}

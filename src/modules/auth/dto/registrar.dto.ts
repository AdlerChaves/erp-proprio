import { Type } from 'class-transformer';
import { IsDefined, IsEmail, IsNotEmpty, Length, ValidateNested } from 'class-validator';
import { SenhaForte } from '../../../common/validadores/senha-forte';
import { CreateEmpresaDto } from '../../empresas/dto/create-empresa.dto';
import { NormalizarEmail } from '../../usuarios/dto/email.transform';

export class NovoUsuarioDto {
  @IsNotEmpty()
  @Length(1, 150)
  nome: string;

  @NormalizarEmail()
  @IsEmail()
  email: string;

  @SenhaForte()
  senha: string;
}

/** IsDefined é necessário: sem ele, ValidateNested aceita o objeto ausente. */
export class RegistrarDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => CreateEmpresaDto)
  empresa: CreateEmpresaDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => NovoUsuarioDto)
  usuario: NovoUsuarioDto;
}

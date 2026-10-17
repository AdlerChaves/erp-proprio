import { IsEmail, IsEnum, IsNotEmpty, IsOptional, Length } from 'class-validator';
import { SenhaForte } from '../../../common/validadores/senha-forte';
import { Perfil } from '../perfil.enum';
import { NormalizarEmail } from './email.transform';

export class AdicionarUsuarioDto {
  @NormalizarEmail()
  @IsEmail()
  email: string;

  /** Obrigatório só se o e-mail ainda não tiver conta. */
  @IsOptional()
  @IsNotEmpty()
  @Length(1, 150)
  nome?: string;

  /** Obrigatória só se o e-mail ainda não tiver conta. */
  @IsOptional()
  @SenhaForte()
  senha?: string;

  @IsEnum(Perfil)
  perfil: Perfil;
}

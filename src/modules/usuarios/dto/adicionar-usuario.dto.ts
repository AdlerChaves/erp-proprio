import { IsEmail, IsEnum, IsNotEmpty, IsOptional, Length } from 'class-validator';
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
  @Length(8, 72)
  senha?: string;

  @IsEnum(Perfil)
  perfil: Perfil;
}

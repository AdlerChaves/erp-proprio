import { IsEmail, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { NormalizarEmail } from '../../usuarios/dto/email.transform';

export class LoginDto {
  @NormalizarEmail()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  senha: string;

  /** Obrigatório quando o usuário tem acesso a mais de uma empresa. */
  @IsOptional()
  @IsUUID()
  empresaId?: string;
}

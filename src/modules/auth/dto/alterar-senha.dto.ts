import { IsNotEmpty, Length } from 'class-validator';

export class AlterarSenhaDto {
  @IsNotEmpty()
  senhaAtual: string;

  @Length(8, 72)
  novaSenha: string;
}

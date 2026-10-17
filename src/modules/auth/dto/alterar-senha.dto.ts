import { IsNotEmpty } from 'class-validator';
import { SenhaForte } from '../../../common/validadores/senha-forte';

export class AlterarSenhaDto {
  @IsNotEmpty()
  senhaAtual: string;

  @SenhaForte()
  novaSenha: string;
}

import { applyDecorators } from '@nestjs/common';
import { Length, ValidateBy, ValidationOptions } from 'class-validator';

/** Senhas que aparecem no topo de qualquer lista de vazamentos. Comparação sem diferenciar maiúsculas. */
const SENHAS_COMUNS = new Set([
  '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', '12341234', '11223344',
  'password', 'password1', 'password123', 'qwerty123', 'qwertyuiop', 'abc12345', 'abcd1234', 'iloveyou',
  'senha123', 'senha1234', 'senhasenha', 'mudar123', 'mudar1234', 'admin123', 'admin1234', 'brasil123',
  'brasil2026', 'trocar123', 'teste123', 'teste1234', 'minhasenha', 'senha@123',
]);

const fraca = (senha: string) => SENHAS_COMUNS.has(senha.toLowerCase()) || /^(.)\1+$/.test(senha);

/** Entre 8 e 72 caracteres, fora da lista de senhas mais comuns e sem um único caractere repetido. */
export function SenhaForte(options?: ValidationOptions) {
  return applyDecorators(
    Length(8, 72),
    ValidateBy(
      {
        name: 'senhaForte',
        validator: {
          validate: (valor) => typeof valor === 'string' && !fraca(valor),
          defaultMessage: () => 'senha muito comum; escolha outra',
        },
      },
      options,
    ),
  );
}

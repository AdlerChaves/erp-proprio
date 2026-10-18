import { IsOptional, Length, Matches, Validate, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';
import { municipio } from '../modules/nfse/catalogos';

@ValidatorConstraint({ name: 'municipioIbge' })
export class MunicipioIbge implements ValidatorConstraintInterface {
  validate(codigo: unknown) {
    return typeof codigo === 'string' && !!municipio(codigo);
  }
  defaultMessage() {
    return 'codigoMunicipio deve ser um código IBGE de município (7 dígitos) existente';
  }
}

/** Endereço no Brasil, como a NFS-e nacional pede para o tomador. */
export class EnderecoDto {
  @Matches(/^\d{8}$/, { message: 'cep deve ter 8 dígitos' })
  cep: string;

  @Length(1, 255)
  logradouro: string;

  @Length(1, 60)
  numero: string;

  @IsOptional()
  @Length(1, 156)
  complemento?: string;

  @Length(1, 60)
  bairro: string;

  @Validate(MunicipioIbge)
  codigoMunicipio: string;
}

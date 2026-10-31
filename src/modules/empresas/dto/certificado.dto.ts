import { IsBase64, IsString, Length, MaxLength } from 'class-validator';

export class CertificadoDto {
  /** Conteúdo do arquivo .pfx ou .p12 do certificado A1, em base64. */
  @IsBase64()
  @MaxLength(100_000)
  certificado: string;

  @IsString()
  @Length(1, 100)
  senha: string;
}

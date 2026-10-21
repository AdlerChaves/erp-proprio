import { IsBase64, IsNotEmpty, IsUUID, Length, MaxLength } from 'class-validator';

export class ImportarOfxDto {
  @IsUUID()
  contaBancariaId: string;

  @IsNotEmpty()
  @Length(1, 255)
  nomeArquivo: string;

  /** Conteúdo do arquivo em base64: a codificação (Windows-1252 ou UTF-8) é lida do próprio OFX. */
  @IsBase64()
  @MaxLength(1_500_000)
  conteudo: string;
}

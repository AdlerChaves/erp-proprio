import { IsDateString, IsOptional, Length, Matches } from 'class-validator';

/** Dados da NFS-e emitida no portal da prefeitura, para a nota ficar EMITIDA no ERP. */
export class RegistrarEmissaoDto {
  @Matches(/^\d{1,15}$/, { message: 'numeroNfse deve ter só dígitos (até 15)' })
  numeroNfse: string;

  @IsDateString({ strict: true })
  dataEmissao: string;

  @IsOptional()
  @Length(1, 60)
  codigoVerificacao?: string;

  /** Chave de acesso de 50 posições da NFS-e nacional. */
  @IsOptional()
  @Matches(/^[A-Za-z0-9]{50}$/, { message: 'chaveAcesso deve ter 50 letras ou dígitos' })
  chaveAcesso?: string;
}

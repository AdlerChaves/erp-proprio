import { IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsUUID, Length, Matches, Max, Min } from 'class-validator';

export class CreateCartaoDto {
  /** Ex.: "Itaú Empresas Visa". */
  @IsNotEmpty()
  @Length(1, 100)
  nome: string;

  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'final deve ter os 4 últimos dígitos do cartão' })
  final?: string | null;

  /** Conta de onde a fatura é paga. */
  @IsUUID()
  contaBancariaId: string;

  /** Emissor do cartão (o banco), cadastrado como fornecedor: é quem aparece na conta a pagar. */
  @IsUUID()
  fornecedorId: string;

  @IsInt()
  @Min(1)
  @Max(31)
  diaFechamento: number;

  @IsInt()
  @Min(1)
  @Max(31)
  diaVencimento: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  limite?: number | null;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

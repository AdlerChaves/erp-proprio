import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';

/** Configuração completa da proposta em PDF (substitui a anterior). Textos vazios: envie null. */
export class ConfigPropostaDto {
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  @Length(1, 45, { each: true })
  destaques: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  validadeDias: number | null;

  @IsOptional()
  @Length(1, 120)
  prazoEntrega: string | null;

  @IsOptional()
  @Length(1, 120)
  garantia: string | null;

  @IsOptional()
  @Length(1, 1000)
  condicoes: string | null;

  @IsBoolean()
  simularCartao: boolean;

  /** % ao mês, de 0 a 15. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(15)
  jurosCartao: number;

  @IsInt()
  @Min(1)
  @Max(24)
  parcelasCartao: number;

  @IsInt()
  @Min(1)
  @Max(24)
  parcelasSemJuros: number;
}

import { IsBoolean, IsNumber, IsOptional, IsUUID, Length, Min } from 'class-validator';

export class ConciliarLinhaDto {
  /** Movimentação do sistema que corresponde à linha do banco (mesmo valor e sentido). */
  @IsUUID()
  movimentacaoId: string;
}

/** Cria a movimentação avulsa a partir da linha (tarifa, rendimento, ajuste) e já concilia. */
export class LancarAvulsaDto {
  @IsOptional()
  @Length(1, 255)
  descricao?: string;

  @IsOptional()
  @IsUUID()
  planoContaId?: string;

  @IsOptional()
  @IsUUID()
  centroCustoId?: string;
}

/**
 * Dá baixa numa conta a receber (linha de entrada) ou a pagar (linha de saída) com o valor e a data da linha.
 * Valor acima do saldo vira juros; abaixo, pagamento parcial, ou desconto se quitarComDesconto.
 */
export class BaixarContaDto {
  @IsUUID()
  contaId: string;

  @IsOptional()
  @IsBoolean()
  quitarComDesconto?: boolean;

  /** Só para conferir: multa embutida no valor a mais (o resto vira juros). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  multa?: number;
}

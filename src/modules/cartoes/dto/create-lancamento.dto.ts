import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsUUID, Length, Max, Min } from 'class-validator';
import { TipoLancamentoCartao } from '../lancamento-cartao.entity';

export class CreateLancamentoCartaoDto {
  /** Data da compra; define a fatura. */
  @IsDateString({ strict: true })
  data: string;

  @IsNotEmpty()
  @Length(1, 255)
  descricao: string;

  /** Valor total; parcelado, é dividido entre as parcelas. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valor: number;

  /** Padrão: COMPRA. ESTORNO é um crédito na fatura. */
  @IsOptional()
  @IsEnum(TipoLancamentoCartao)
  tipo?: TipoLancamentoCartao;

  /** Compra parcelada: uma parcela em cada fatura, a partir da fatura da data da compra. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(48)
  parcelas?: number;

  /** Categoria de despesa (analítica e ativa). */
  @IsOptional()
  @IsUUID()
  planoContaId?: string | null;

  @IsOptional()
  @IsUUID()
  centroCustoId?: string | null;

  /** Estabelecimento, se for um fornecedor cadastrado. */
  @IsOptional()
  @IsUUID()
  fornecedorId?: string | null;
}

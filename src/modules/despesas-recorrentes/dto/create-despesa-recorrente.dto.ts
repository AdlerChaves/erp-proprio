import { IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsUUID, Length, Matches, Max, Min } from 'class-validator';
import { COMPETENCIA, MENSAGEM_COMPETENCIA } from '../../contratos/dto/create-contrato.dto';
import { AjusteDiaUtil, TipoValorDespesa } from '../despesa-recorrente.entity';

export class CreateDespesaRecorrenteDto {
  @IsUUID()
  fornecedorId: string;

  @IsNotEmpty()
  @Length(1, 120)
  descricao: string;

  @IsEnum(TipoValorDespesa)
  tipoValor: TipoValorDespesa;

  /** Obrigatório nos tipos FIXO e ESTIMADO (no estimado, é a estimativa até haver contas reais). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  valor?: number | null;

  /** Obrigatório no tipo PERCENTUAL_FATURAMENTO. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  percentual?: number | null;

  /** 1 mensal (padrão), 2 bimestral, 3 trimestral, 6 semestral, 12 anual. */
  @IsOptional()
  @IsIn([1, 2, 3, 6, 12])
  intervaloMeses?: number;

  @IsInt()
  @Min(1)
  @Max(31)
  diaVencimento: number;

  /** Padrão: POSTERGAR (dia útil seguinte). */
  @IsOptional()
  @IsEnum(AjusteDiaUtil)
  ajusteDiaUtil?: AjusteDiaUtil;

  @Matches(COMPETENCIA, { message: `inicio ${MENSAGEM_COMPETENCIA}` })
  inicio: string;

  @IsOptional()
  @Matches(COMPETENCIA, { message: `fim ${MENSAGEM_COMPETENCIA}` })
  fim?: string | null;

  /** Padrão: 10 dias antes do vencimento. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  diasAntecedencia?: number;

  @IsOptional()
  @IsUUID()
  planoContaId?: string | null;

  @IsOptional()
  @IsUUID()
  centroCustoId?: string | null;

  @IsOptional()
  @Length(0, 300)
  observacoes?: string | null;
}

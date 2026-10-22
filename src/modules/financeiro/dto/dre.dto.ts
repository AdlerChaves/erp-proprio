import { OmitType } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';

export class DreDto {
  @IsDateString({ strict: true })
  de: string;

  @IsDateString({ strict: true })
  ate: string;

  /**
   * competencia (padrão): contas pela data de emissão, pelo valor original.
   * caixa: baixas pela data do pagamento, pelo valor efetivamente pago.
   * Nos dois, entram também as movimentações avulsas pela data delas.
   */
  @IsOptional()
  @IsIn(['competencia', 'caixa'])
  regime?: 'competencia' | 'caixa';

  /** Só os lançamentos deste centro de custo (serviço, projeto, loja). */
  @IsOptional()
  @IsUUID()
  centroCustoId?: string;
}

export class ResumoCentroCustoDto extends OmitType(DreDto, ['centroCustoId'] as const) {}

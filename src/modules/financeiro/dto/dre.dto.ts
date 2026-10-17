import { IsDateString, IsIn, IsOptional } from 'class-validator';

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
}

import { IsDateString } from 'class-validator';

export class ProjecaoDto {
  /** Último dia da projeção (a partir de hoje). */
  @IsDateString({ strict: true })
  ate: string;
}

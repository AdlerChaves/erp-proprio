import { IsNotEmpty, Length } from 'class-validator';

export class CancelarNotaServicoDto {
  /** Ex.: "Valor errado; nota substituída". */
  @IsNotEmpty()
  @Length(5, 255)
  motivo: string;
}

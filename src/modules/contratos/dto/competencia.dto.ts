import { Matches } from 'class-validator';
import { COMPETENCIA, MENSAGEM_COMPETENCIA } from './create-contrato.dto';

export class CompetenciaDto {
  @Matches(COMPETENCIA, { message: `competencia ${MENSAGEM_COMPETENCIA}` })
  competencia: string;
}

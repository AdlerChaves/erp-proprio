import { IsIn, IsNotEmpty, IsOptional, Length } from 'class-validator';
import { MotivoCancelamento } from '../evento';

export class CancelarNotaServicoDto {
  /** Ex.: "Valor errado; nota substituída". Na nota emitida pelo ERP, vai para o Emissor Nacional (mínimo 15 caracteres). */
  @IsNotEmpty()
  @Length(5, 255)
  motivo: string;

  /** Exigido na nota emitida pelo ERP: 1 erro na emissão, 2 serviço não prestado, 9 outros. */
  @IsOptional()
  @IsIn([MotivoCancelamento.ERRO_EMISSAO, MotivoCancelamento.SERVICO_NAO_PRESTADO, MotivoCancelamento.OUTROS], {
    message: 'codigoMotivo deve ser 1 (erro na emissão), 2 (serviço não prestado) ou 9 (outros)',
  })
  codigoMotivo?: MotivoCancelamento;
}

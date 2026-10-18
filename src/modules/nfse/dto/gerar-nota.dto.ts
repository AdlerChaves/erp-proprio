import { IsBoolean, IsDateString, IsNumber, IsOptional, Length, Max, Min, Validate } from 'class-validator';
import { MunicipioIbge } from '../../../common/endereco.dto';

export class GerarNotaServicoDto {
  /** Data da prestação do serviço. Padrão: a data do faturamento da venda. */
  @IsOptional()
  @IsDateString({ strict: true })
  dataCompetencia?: string;

  /** O tomador retém o ISS (comum quando o cliente é empresa de outro município ou órgão público). */
  @IsOptional()
  @IsBoolean()
  issRetido?: boolean;

  /** Obrigatória com ISS retido no Simples: a alíquota de ISS da sua faixa, de 2% a 5%. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(2)
  @Max(5)
  aliquotaIss?: number;

  /** Código IBGE do município onde o serviço foi prestado. Padrão: o da empresa. */
  @IsOptional()
  @Validate(MunicipioIbge)
  municipioPrestacao?: string;

  /** Substitui a descrição montada a partir dos itens; só quando a venda gera uma nota. */
  @IsOptional()
  @Length(1, 2000)
  descricao?: string;
}

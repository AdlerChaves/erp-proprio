import { OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEmail, IsEnum, IsIn, IsInt, IsNumber, IsOptional, Length, Matches, Max, Min, Validate, ValidateNested } from 'class-validator';
import { EnderecoDto, MunicipioIbge } from '../../../common/endereco.dto';
import { AmbienteNfse, RegimeTributario } from '../empresa.entity';
import { ConfigPropostaDto } from './config-proposta.dto';
import { CreateEmpresaDto } from './create-empresa.dto';

/** O CNPJ não muda. Os dados fiscais alimentam a nota de serviço; envie null para limpar. */
export class UpdateEmpresaDto extends PartialType(OmitType(CreateEmpresaDto, ['cnpj'] as const)) {
  @IsOptional()
  @Length(1, 15)
  inscricaoMunicipal?: string | null;

  /** Código IBGE do município do cadastro, como 3556503 (Várzea Paulista). */
  @IsOptional()
  @Validate(MunicipioIbge)
  codigoMunicipio?: string | null;

  @IsOptional()
  @IsEnum(RegimeTributario)
  regimeTributario?: RegimeTributario | null;

  /** Só ME/EPP do Simples: 1 = tudo pelo Simples (padrão); 2 = ISS pela prefeitura; 3 = tudo fora do Simples. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  regimeApuracaoSimples?: number;

  /** Percentual aproximado dos tributos do Simples na faixa atual, como 6 (%). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99.99)
  aliquotaSimples?: number | null;

  /** De 1 a 49999 (faixa de aplicativo próprio). */
  @IsOptional()
  @Matches(/^(?!0+$)\d{1,5}$/, { message: 'nfseSerie deve ser um número de 1 a 49999' })
  nfseSerie?: string;

  @IsOptional()
  @IsIn([AmbienteNfse.PRODUCAO, AmbienteNfse.HOMOLOGACAO])
  nfseAmbiente?: AmbienteNfse;

  /** A partir de qual número os orçamentos e vendas são numerados (ex.: 2739). Números já usados não mudam. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999_999_999)
  numeroInicialVendas?: number;

  /** Painel de apontamento: dias antes da data limite em que a etapa passa a amarela. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  diasAlertaEtapa?: number;

  /** Destaques, validade, prazos e parcelamento no cartão dos orçamentos em PDF. */
  @IsOptional()
  @ValidateNested()
  @Type(() => ConfigPropostaDto)
  proposta?: ConfigPropostaDto;

  /** Contato que aparece em orçamentos e pedidos. Envie null para limpar. */
  @IsOptional()
  @Length(8, 20)
  telefone?: string | null;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => EnderecoDto)
  endereco?: EnderecoDto | null;
}

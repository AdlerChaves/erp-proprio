import { ArrayNotEmpty, IsArray, IsBoolean, IsDateString, IsEnum, IsNotEmpty, IsOptional, IsUUID, Length, MaxLength } from 'class-validator';
import { SituacaoObra } from '../situacao-obra.enum';

export class CreateEtapaPadraoDto {
  @IsNotEmpty()
  @Length(1, 100)
  nome: string;
}

export class UpdateEtapaPadraoDto {
  @IsOptional()
  @IsNotEmpty()
  @Length(1, 100)
  nome?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

/** Nova ordem: todos os ids da lista, do primeiro ao último. */
export class OrdemDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  ids: string[];
}

export class CreateEtapaObraDto {
  @IsNotEmpty()
  @Length(1, 100)
  nome: string;

  @IsOptional()
  @IsDateString({ strict: true })
  dataLimite?: string | null;
}

export class UpdateEtapaObraDto {
  @IsOptional()
  @IsNotEmpty()
  @Length(1, 100)
  nome?: string;

  /** Envie null para tirar a data limite. */
  @IsOptional()
  @IsDateString({ strict: true })
  dataLimite?: string | null;

  /** true marca como concluída hoje; false reabre a etapa. */
  @IsOptional()
  @IsBoolean()
  concluida?: boolean;
}

/** Situação e observação da obra; envie null para limpar. */
export class UpdateObraDto {
  @IsOptional()
  @IsEnum(SituacaoObra)
  situacao?: SituacaoObra | null;

  @IsOptional()
  @MaxLength(500)
  observacao?: string | null;
}

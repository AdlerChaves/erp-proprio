import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { Perfil } from '../perfil.enum';

export class AtualizarAcessoDto {
  @IsOptional()
  @IsEnum(Perfil)
  perfil?: Perfil;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

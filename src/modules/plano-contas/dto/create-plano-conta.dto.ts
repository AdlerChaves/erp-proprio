import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsUUID, Length, Matches } from 'class-validator';
import { TipoPlanoConta } from '../plano-conta.entity';

export class CreatePlanoContaDto {
  /** Números separados por ponto; a subconta começa com o código da conta pai. Ex.: 1.01.003 */
  @Matches(/^\d+(\.\d+)*$/, { message: 'codigo deve ter números separados por ponto, ex.: 1.01.003' })
  @Length(1, 20)
  codigo: string;

  @IsNotEmpty()
  @Length(1, 150)
  nome: string;

  @IsEnum(TipoPlanoConta)
  tipo: TipoPlanoConta;

  @IsOptional()
  @IsUUID()
  contaPaiId?: string;

  /** false para conta sintética (agrupadora). Padrão: true. */
  @IsOptional()
  @IsBoolean()
  aceitaLancamento?: boolean;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

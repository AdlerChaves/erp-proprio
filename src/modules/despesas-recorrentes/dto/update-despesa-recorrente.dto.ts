import { IsEnum, IsOptional } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { SituacaoDespesa } from '../despesa-recorrente.entity';
import { CreateDespesaRecorrenteDto } from './create-despesa-recorrente.dto';

/** Vale para as contas ainda não lançadas; as já lançadas não mudam. */
export class UpdateDespesaRecorrenteDto extends PartialType(CreateDespesaRecorrenteDto) {}

export class FiltroDespesasDto {
  @IsOptional()
  @IsEnum(SituacaoDespesa)
  situacao?: SituacaoDespesa;
}

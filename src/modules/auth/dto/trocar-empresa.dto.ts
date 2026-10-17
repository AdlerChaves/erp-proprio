import { IsUUID } from 'class-validator';

export class TrocarEmpresaDto {
  @IsUUID()
  empresaId: string;
}

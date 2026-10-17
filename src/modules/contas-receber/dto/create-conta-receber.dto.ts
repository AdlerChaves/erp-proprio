import { IsInt, IsUUID, Max, Min } from 'class-validator';
import { DadosContaDto } from '../../financeiro/dto/dados-conta.dto';

export class CreateContaReceberDto extends DadosContaDto {
  @IsUUID()
  clienteId: string;
}

/** valor é o total, dividido entre as parcelas; dataVencimento é o da primeira, e as demais vencem mês a mês. */
export class CreateParcelamentoContaReceberDto extends CreateContaReceberDto {
  @IsInt()
  @Min(2)
  @Max(120)
  parcelas: number;
}

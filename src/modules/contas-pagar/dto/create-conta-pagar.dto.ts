import { IsInt, IsUUID, Max, Min } from 'class-validator';
import { DadosContaDto } from '../../financeiro/dto/dados-conta.dto';

export class CreateContaPagarDto extends DadosContaDto {
  @IsUUID()
  fornecedorId: string;
}

/** valor é o total, dividido entre as parcelas; dataVencimento é o da primeira, e as demais vencem mês a mês. */
export class CreateParcelamentoContaPagarDto extends CreateContaPagarDto {
  @IsInt()
  @Min(2)
  @Max(120)
  parcelas: number;
}

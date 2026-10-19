import { PickType } from '@nestjs/swagger';
import { PartialType } from '@nestjs/swagger';
import { CreateLancamentoCartaoDto } from './create-lancamento.dto';

/**
 * Só a descrição e a classificação mudam, em todas as parcelas da compra (inclusive em fatura fechada).
 * Para mudar valor, data ou parcelas, exclua a compra e lance de novo.
 */
export class UpdateLancamentoCartaoDto extends PartialType(
  PickType(CreateLancamentoCartaoDto, ['descricao', 'planoContaId', 'centroCustoId', 'fornecedorId'] as const),
) {}

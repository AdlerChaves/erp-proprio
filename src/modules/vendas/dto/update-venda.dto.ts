import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateVendaDto } from './create-venda.dto';

/** Só orçamentos e pedidos mudam. Itens, se enviados, substituem todos os anteriores. */
export class UpdateVendaDto extends PartialType(OmitType(CreateVendaDto, ['status'] as const)) {}

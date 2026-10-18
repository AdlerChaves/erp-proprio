import { PartialType } from '@nestjs/swagger';
import { CreateCompraDto } from './create-compra.dto';

/** Só pedidos ainda não recebidos mudam. Itens, se enviados, substituem todos os anteriores. */
export class UpdateCompraDto extends PartialType(CreateCompraDto) {}

import { PartialType } from '@nestjs/swagger';
import { CreateCartaoDto } from './create-cartao.dto';

/** Mudar os dias padrão atualiza as faturas abertas que não tiveram as datas ajustadas à mão. */
export class UpdateCartaoDto extends PartialType(CreateCartaoDto) {}

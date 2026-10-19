import { BadRequestException, PipeTransform } from '@nestjs/common';

/** Competência no formato AAAA-MM (mês do vencimento da fatura). */
export class ParseCompetenciaPipe implements PipeTransform<string, string> {
  transform(valor: string) {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(valor)) throw new BadRequestException('A competência deve estar no formato AAAA-MM');
    return valor;
  }
}

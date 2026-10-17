import { ArgumentsHost, Catch, ConflictException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { QueryFailedError } from 'typeorm';

/**
 * Converte violações de integridade do PostgreSQL em 409 em vez de 500.
 * Cobre corridas entre a checagem do serviço e a gravação, e remoções de registros em uso.
 */
@Catch(QueryFailedError)
export class ErroBancoFilter extends BaseExceptionFilter {
  catch(erro: QueryFailedError & { driverError?: { code?: string } }, host: ArgumentsHost) {
    switch (erro.driverError?.code) {
      case '23505':
        return super.catch(new ConflictException('Já existe um registro com estes dados'), host);
      case '23503':
        return super.catch(
          new ConflictException('Registro vinculado a outros cadastros; desative-o em vez de remover'),
          host,
        );
      default:
        return super.catch(erro, host);
    }
  }
}

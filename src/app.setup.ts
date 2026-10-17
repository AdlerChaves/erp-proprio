import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ErroBancoFilter } from './common/erro-banco.filter';

/** Configuração global compartilhada entre o main.ts e os testes e2e. */
export function configurarApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new ErroBancoFilter(app.get(HttpAdapterHost).httpAdapter));
}

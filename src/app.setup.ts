import { INestApplication, ValidationPipe } from '@nestjs/common';

/** Configuração global compartilhada entre o main.ts e os testes e2e. */
export function configurarApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
}

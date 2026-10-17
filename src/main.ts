import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configurarApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configurarApp(app);

  // Em produção, a documentação só fica no ar com SWAGGER_HABILITADO=true.
  const swagger = process.env.SWAGGER_HABILITADO
    ? process.env.SWAGGER_HABILITADO === 'true'
    : process.env.NODE_ENV !== 'production';
  if (swagger) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('ERP Próprio')
      .setDescription('API do ERP: cadastros, financeiro, relatórios e auditoria')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

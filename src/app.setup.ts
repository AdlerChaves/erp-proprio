import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ErroBancoFilter } from './common/erro-banco.filter';

/** Valor de TRUST_PROXY no formato que o Express espera: número de proxies, true/false ou lista de IPs. */
function confiarProxy(valor: string) {
  if (/^\d+$/.test(valor)) return Number(valor);
  if (valor === 'true' || valor === 'false') return valor === 'true';
  return valor;
}

/** Configuração global compartilhada entre o main.ts e os testes e2e. */
export function configurarApp(app: INestApplication) {
  // Cabeçalhos de segurança. Sem CSP: a API só devolve JSON, e a CSP padrão quebraria a página do Swagger.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

  // Sem CORS_ORIGENS, nenhum site de outra origem consegue chamar a API pelo navegador.
  const origens = process.env.CORS_ORIGENS?.split(',').map((o) => o.trim()).filter(Boolean);
  if (origens?.length) app.enableCors({ origin: origens });

  // Atrás de um proxy reverso, necessário para o limite por IP e a auditoria verem o IP real.
  if (process.env.TRUST_PROXY) {
    app.getHttpAdapter().getInstance().set('trust proxy', confiarProxy(process.env.TRUST_PROXY));
  }

  app.use(cookieParser());

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new ErroBancoFilter(app.get(HttpAdapterHost).httpAdapter));
}

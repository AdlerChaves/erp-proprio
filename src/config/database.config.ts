import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

// Compartilhado entre a aplicação e o CLI de migrations.
export function databaseOptions(): PostgresConnectionOptions {
  return {
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USER ?? 'erp',
    password: process.env.DB_PASSWORD ?? 'erp',
    database: process.env.DB_NAME ?? 'erp',
    entities: [__dirname + '/../**/*.entity.{ts,js}'],
    migrations: [__dirname + '/../database/migrations/*.{ts,js}'],
    synchronize: false,
  };
}

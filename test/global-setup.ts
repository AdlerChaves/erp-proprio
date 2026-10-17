import 'ts-node/register/transpile-only';
import { DataSource } from 'typeorm';
import './setup-env';
import { databaseOptions } from '../src/config/database.config';

/** Recria o banco de testes do zero e aplica todas as migrations. */
export default async function globalSetup() {
  const nome = process.env.DB_NAME!;
  if (!nome.endsWith('_test')) {
    throw new Error(`O banco de testes precisa terminar com _test (recebido: ${nome})`);
  }

  const admin = new DataSource({
    ...databaseOptions(),
    database: 'postgres',
    entities: [],
    migrations: [],
  });
  await admin.initialize();
  await admin.query(`DROP DATABASE IF EXISTS "${nome}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${nome}"`);
  await admin.destroy();

  const dataSource = new DataSource(databaseOptions());
  await dataSource.initialize();
  await dataSource.runMigrations();
  await dataSource.destroy();
}

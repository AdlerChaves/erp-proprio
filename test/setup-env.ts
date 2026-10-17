import { config } from 'dotenv';

// Usa o mesmo servidor do .env, mas sempre num banco separado: os testes apagam tudo.
config();
process.env.DB_NAME = process.env.DB_TEST_NAME ?? 'erp_test';
process.env.JWT_SECRET ??= 'segredo-de-teste';

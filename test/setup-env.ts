import { config } from 'dotenv';

// Usa o mesmo servidor do .env, mas sempre num banco separado: os testes apagam tudo.
config();
process.env.DB_NAME = process.env.DB_TEST_NAME ?? 'erp_test';
process.env.JWT_SECRET ??= 'segredo-de-teste-com-pelo-menos-32-caracteres';
process.env.CHAVE_CERTIFICADOS = 'a'.repeat(64);
// O agendador dos contratos não roda sozinho nos testes; eles chamam a rodada direto.
process.env.CONTRATOS_AGENDADOR_MINUTOS = '0';
// Os testes fazem centenas de requisições do mesmo IP; o teste de segurança baixa estes limites.
process.env.THROTTLE_LIMITE = '1000000';
process.env.THROTTLE_LOGIN_LIMITE = '1000000';

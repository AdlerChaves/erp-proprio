import { EntityManager } from 'typeorm';

/**
 * Próximo número sequencial do documento na empresa (1, 2, 3...). A trava vale até o fim da transação,
 * então dois pedidos simultâneos nunca recebem o mesmo número.
 */
export async function proximoNumero(m: EntityManager, tabela: 'vendas' | 'compras', empresaId: string) {
  await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`${tabela}:${empresaId}`]);
  const [{ numero }]: { numero: number }[] = await m.query(
    `SELECT COALESCE(MAX(numero), 0) + 1 AS numero FROM "${tabela}" WHERE empresa_id = $1`,
    [empresaId],
  );
  return Number(numero);
}

import { EntityManager } from 'typeorm';

const COLUNAS = { vendas: 'numero', compras: 'numero', notas_servico: 'numero_dps' } as const;

/**
 * Próximo número sequencial do documento na empresa (1, 2, 3...). A trava vale até o fim da transação,
 * então dois documentos simultâneos nunca recebem o mesmo número.
 */
export async function proximoNumero(m: EntityManager, tabela: keyof typeof COLUNAS, empresaId: string) {
  const coluna = COLUNAS[tabela];
  await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`${tabela}:${empresaId}`]);
  const [{ numero }]: { numero: number }[] = await m.query(
    `SELECT COALESCE(MAX("${coluna}"), 0) + 1 AS numero FROM "${tabela}" WHERE empresa_id = $1`,
    [empresaId],
  );
  return Number(numero);
}

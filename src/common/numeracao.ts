import { EntityManager } from 'typeorm';

const COLUNAS = { vendas: 'numero', compras: 'numero', notas_servico: 'numero_dps', contratos: 'numero' } as const;

/** Documentos cuja numeração a empresa pode fazer começar de um número maior que 1. */
const INICIO: Partial<Record<keyof typeof COLUNAS, string>> = { vendas: 'numero_inicial_vendas' };

/**
 * Próximo número sequencial do documento na empresa (1, 2, 3..., ou a partir do número inicial configurado).
 * A trava vale até o fim da transação, então dois documentos simultâneos nunca recebem o mesmo número.
 */
export async function proximoNumero(m: EntityManager, tabela: keyof typeof COLUNAS, empresaId: string) {
  const coluna = COLUNAS[tabela];
  await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`${tabela}:${empresaId}`]);
  const inicio = INICIO[tabela] ? `(SELECT "${INICIO[tabela]}" FROM empresas WHERE id = $1)` : '1';
  const [{ numero }]: { numero: number }[] = await m.query(
    `SELECT GREATEST(COALESCE(MAX("${coluna}"), 0) + 1, ${inicio}) AS numero FROM "${tabela}" WHERE empresa_id = $1`,
    [empresaId],
  );
  return Number(numero);
}

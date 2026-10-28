import { Pool, types } from 'pg';

// Return Postgres dates as plain 'YYYY-MM-DD' strings and bigint as numbers (amounts stay far below 2^53).
types.setTypeParser(1082, (v) => v);
types.setTypeParser(20, (v) => Number(v));
types.setTypeParser(1700, (v) => Number(v));

const g = globalThis as any;

export type Q = <T = any>(text: string, params?: any[]) => Promise<T[]>;

/** One connection pool per server process (reused across hot reloads). */
function pool(): Pool {
  if (!g.__gpPool) {
    if (!process.env.DATABASE_URL)
      throw new Error('DATABASE_URL is not set. See README.md, step 3.');
    g.__gpPool = new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.PG_POOL_MAX || 5) });
    g.__gpPool.on('error', () => {}); // an idle Neon connection may be closed; the pool reconnects
  }
  return g.__gpPool;
}

export const query: Q = async (text, params = []) =>
  g.__gpTestDb
    ? (await g.__gpTestDb.query(text, params)).rows
    : (await pool().query(text, params)).rows;

/** Run several statements atomically. */
export async function tx<T>(fn: (q: Q) => Promise<T>): Promise<T> {
  if (g.__gpTestDb)
    return g.__gpTestDb.transaction((t: any) =>
      fn(async (text, params = []) => (await t.query(text, params)).rows),
    );
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(async (text, params = []) => (await client.query(text, params)).rows);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

import pg from 'pg';

const pools = new Map();

/**
 * Get or create a pg.Pool for the given database name.
 * Pools are cached per database name to avoid creating multiple connections.
 * @param {string} database - PostgreSQL database name (e.g. 'cmms', 'formy')
 * @returns {pg.Pool}
 */
export function getPool(database) {
  if (pools.has(database)) return pools.get(database);

  const pool = new pg.Pool({
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_SYNC_USER,
    password: process.env.POSTGRES_SYNC_PASS,
    database,
  });

  pools.set(database, pool);
  return pool;
}

/**
 * Close all cached pools. Call during graceful shutdown.
 */
export async function closeAllPools() {
  for (const [name, pool] of pools) {
    await pool.end();
    pools.delete(name);
  }
}

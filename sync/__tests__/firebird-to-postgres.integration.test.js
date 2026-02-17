import { describe, test, expect } from 'bun:test';
import Firebird from 'node-firebird';
import { getPool, closeAllPools } from '../../lib/postgres.js';

// Skip if env vars not set
const SKIP = !process.env.FIREBIRD_CMMS_HOST || !process.env.POSTGRES_SYNC_USER;

describe.skipIf(SKIP)('Firebird→PostgreSQL integration', () => {
  test('can connect to Firebird CMMS', async () => {
    const db = await new Promise((resolve, reject) => {
      Firebird.attach({
        host: process.env.FIREBIRD_CMMS_HOST,
        port: parseInt(process.env.FIREBIRD_CMMS_PORT || '3050', 10),
        database: process.env.FIREBIRD_CMMS_DB,
        user: process.env.FIREBIRD_CMMS_USER || 'SYSDBA',
        password: process.env.FIREBIRD_CMMS_PASS,
      }, (err, db) => err ? reject(err) : resolve(db));
    });

    const tables = await new Promise((resolve, reject) => {
      db.query(
        `SELECT TRIM(RDB$RELATION_NAME) AS TABLE_NAME FROM RDB$RELATIONS WHERE RDB$SYSTEM_FLAG = 0 AND RDB$VIEW_BLR IS NULL`,
        [],
        (err, result) => err ? reject(err) : resolve(result)
      );
    });

    expect(tables.length).toBeGreaterThan(0);
    console.log(`Found ${tables.length} tables in CMMS`);

    await new Promise((resolve) => db.detach(resolve));
  });

  test('can connect to PostgreSQL', async () => {
    const pool = getPool(process.env.POSTGRES_CMMS_DB || 'cmms');
    const result = await pool.query('SELECT 1 AS ok');
    expect(result.rows[0].ok).toBe(1);
    await closeAllPools();
  });
});

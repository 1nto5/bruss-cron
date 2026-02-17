import Firebird from 'node-firebird';
import { getPool, closeAllPools } from '../lib/postgres.js';
import { mapFirebirdTypeToPg } from './firebird-type-map.js';

const MAX_BATCH_SIZE = 1000;
const MAX_PG_PARAMS = 50000; // stay well under PostgreSQL's 65535 limit

// Firebird database configs, read from env at runtime
function getFirebirdConfigs() {
  return [
    {
      name: 'cmms',
      pgDatabase: process.env.POSTGRES_CMMS_DB || 'cmms',
      fb: {
        host: process.env.FIREBIRD_CMMS_HOST,
        port: parseInt(process.env.FIREBIRD_CMMS_PORT || '3050', 10),
        database: process.env.FIREBIRD_CMMS_DB,
        user: process.env.FIREBIRD_CMMS_USER || 'SYSDBA',
        password: process.env.FIREBIRD_CMMS_PASS,
      },
    },
    {
      name: 'formy',
      pgDatabase: process.env.POSTGRES_FORMY_DB || 'formy',
      fb: {
        host: process.env.FIREBIRD_FORMY_HOST,
        port: parseInt(process.env.FIREBIRD_FORMY_PORT || '3050', 10),
        database: process.env.FIREBIRD_FORMY_DB,
        user: process.env.FIREBIRD_FORMY_USER || 'SYSDBA',
        password: process.env.FIREBIRD_FORMY_PASS,
      },
    },
  ];
}

/**
 * Promisify Firebird.attach
 */
function attachFirebird(options) {
  return new Promise((resolve, reject) => {
    Firebird.attach(options, (err, db) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
}

/**
 * Promisify db.query
 */
function fbQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

/**
 * Promisify db.detach
 */
function fbDetach(db) {
  return new Promise((resolve, reject) => {
    db.detach((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Resolve a node-firebird TEXT BLOB (returned as a callback function) to a string.
 * Times out after 5 seconds to avoid hanging on large/corrupt BLOBs.
 */
function resolveTextBlob(blobFn) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => resolve(null), 5000);
    blobFn((err, name, event) => {
      if (err) { clearTimeout(timeout); return resolve(null); }
      const chunks = [];
      event.on('data', (chunk) => chunks.push(chunk));
      event.on('end', () => {
        clearTimeout(timeout);
        resolve(Buffer.concat(chunks).toString('utf-8'));
      });
      event.on('error', () => { clearTimeout(timeout); resolve(null); });
    });
  });
}

/**
 * Resolve TEXT BLOB values in a row. Binary BLOBs (BYTEA) are skipped entirely.
 */
async function resolveRowTextBlobs(row, textBlobCols) {
  for (const col of textBlobCols) {
    const val = row[col.name];
    if (typeof val === 'function') {
      row[col.name] = await resolveTextBlob(val);
    }
  }
  return row;
}

/**
 * Get list of user tables from Firebird (excludes system tables).
 */
async function getFirebirdTables(db) {
  const sql = `
    SELECT TRIM(RDB$RELATION_NAME) AS TABLE_NAME
    FROM RDB$RELATIONS
    WHERE RDB$SYSTEM_FLAG = 0
      AND RDB$VIEW_BLR IS NULL
    ORDER BY RDB$RELATION_NAME
  `;
  const rows = await fbQuery(db, sql);
  return rows.map((r) => r.TABLE_NAME);
}

/**
 * Get column definitions for a Firebird table.
 * Returns array of { name, pgType }.
 */
async function getFirebirdColumns(db, tableName) {
  const sql = `
    SELECT
      TRIM(RF.RDB$FIELD_NAME) AS FIELD_NAME,
      F.RDB$FIELD_TYPE AS FIELD_TYPE,
      F.RDB$FIELD_LENGTH AS FIELD_LENGTH,
      F.RDB$FIELD_PRECISION AS FIELD_PRECISION,
      F.RDB$FIELD_SCALE AS FIELD_SCALE,
      F.RDB$FIELD_SUB_TYPE AS FIELD_SUB_TYPE
    FROM RDB$RELATION_FIELDS RF
    JOIN RDB$FIELDS F ON RF.RDB$FIELD_SOURCE = F.RDB$FIELD_NAME
    WHERE RF.RDB$RELATION_NAME = '${tableName}'
    ORDER BY RF.RDB$FIELD_POSITION
  `;
  const rows = await fbQuery(db, sql);
  return rows.map((r) => ({
    name: r.FIELD_NAME,
    pgType: mapFirebirdTypeToPg(
      r.FIELD_TYPE,
      r.FIELD_LENGTH,
      r.FIELD_PRECISION || 0,
      r.FIELD_SCALE || 0,
      r.FIELD_SUB_TYPE
    ),
  }));
}

/**
 * Ensure a PostgreSQL table exists matching the Firebird table structure.
 * Uses CREATE TABLE IF NOT EXISTS — does not alter existing columns.
 */
async function ensurePgTable(pgPool, tableName, columns) {
  const colDefs = columns
    .map((c) => `"${c.name}" ${c.pgType}`)
    .join(', ');
  const sql = `CREATE TABLE IF NOT EXISTS "${tableName}" (${colDefs})`;
  await pgPool.query(sql);
}

/**
 * Sync a single table from Firebird to PostgreSQL.
 * Returns { table, rowCount, status, error? }.
 */
async function syncTable(fbDb, pgPool, tableName) {
  const startTime = Date.now();

  try {
    // 1. Get column definitions
    const columns = await getFirebirdColumns(fbDb, tableName);
    if (columns.length === 0) {
      return { table: tableName, rowCount: 0, status: 'skipped', durationMs: Date.now() - startTime };
    }

    // 2. Filter out BYTEA columns (binary BLOBs are useless for Excel)
    const syncColumns = columns.filter((c) => c.pgType !== 'BYTEA');
    if (syncColumns.length === 0) {
      return { table: tableName, rowCount: 0, status: 'skipped', durationMs: Date.now() - startTime };
    }

    // 3. Ensure PG table exists
    await ensurePgTable(pgPool, tableName, syncColumns);

    // 4. Truncate PG table
    await pgPool.query(`TRUNCATE TABLE "${tableName}"`);

    // 5. Read all rows from Firebird (only non-BYTEA columns)
    const selectCols = syncColumns.map((c) => `"${c.name}"`).join(', ');
    const rows = await fbQuery(fbDb, `SELECT ${selectCols} FROM "${tableName}"`);

    if (!rows || rows.length === 0) {
      return { table: tableName, rowCount: 0, status: 'ok', durationMs: Date.now() - startTime };
    }

    // 6. Resolve TEXT BLOB values (node-firebird returns them as callback functions)
    const textBlobCols = syncColumns.filter((c) => c.pgType === 'TEXT');
    if (textBlobCols.length > 0) {
      for (const row of rows) {
        await resolveRowTextBlobs(row, textBlobCols);
      }
    }

    // 7. Batch insert into PostgreSQL (dynamic batch size based on column count)
    const batchSize = Math.min(MAX_BATCH_SIZE, Math.floor(MAX_PG_PARAMS / syncColumns.length));
    const colNames = syncColumns.map((c) => `"${c.name}"`).join(', ');
    let inserted = 0;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const values = [];
      const placeholders = [];

      for (let rowIdx = 0; rowIdx < batch.length; rowIdx++) {
        const row = batch[rowIdx];
        const rowPlaceholders = syncColumns.map((col, colIdx) => {
          values.push(row[col.name] ?? null);
          return `$${rowIdx * syncColumns.length + colIdx + 1}`;
        });
        placeholders.push(`(${rowPlaceholders.join(', ')})`);
      }

      const insertSql = `INSERT INTO "${tableName}" (${colNames}) VALUES ${placeholders.join(', ')}`;
      await pgPool.query(insertSql, values);
      inserted += batch.length;
    }

    return { table: tableName, rowCount: inserted, status: 'ok', durationMs: Date.now() - startTime };
  } catch (error) {
    return { table: tableName, rowCount: 0, status: 'error', error: error.message, durationMs: Date.now() - startTime };
  }
}

/**
 * Ensure _sync_meta table exists in the given PG database.
 */
async function ensureSyncMetaTable(pgPool) {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS "_sync_meta" (
      table_name VARCHAR(255) PRIMARY KEY,
      last_sync_at TIMESTAMP NOT NULL DEFAULT NOW(),
      row_count INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'ok',
      error_message TEXT
    )
  `);
}

/**
 * Update _sync_meta for a synced table.
 */
async function updateSyncMeta(pgPool, result) {
  await pgPool.query(
    `INSERT INTO "_sync_meta" (table_name, last_sync_at, row_count, status, error_message)
     VALUES ($1, NOW(), $2, $3, $4)
     ON CONFLICT (table_name)
     DO UPDATE SET last_sync_at = NOW(), row_count = $2, status = $3, error_message = $4`,
    [result.table, result.rowCount, result.status, result.error || null]
  );
}

/**
 * Sync one Firebird database to its corresponding PostgreSQL database.
 * Returns { name, tablesTotal, tablesOk, tablesError, errors[] }.
 */
async function syncOneDatabase(config) {
  const { name, pgDatabase, fb } = config;
  console.log(`[firebird-sync] Starting sync for ${name} → ${pgDatabase}`);

  const fbDb = await attachFirebird(fb);
  const pgPool = getPool(pgDatabase);

  try {
    await ensureSyncMetaTable(pgPool);

    const tables = await getFirebirdTables(fbDb);
    console.log(`[firebird-sync] ${name}: found ${tables.length} tables`);

    const results = [];
    for (const tableName of tables) {
      const result = await syncTable(fbDb, pgPool, tableName);
      results.push(result);

      await updateSyncMeta(pgPool, result);

      if (result.status === 'ok') {
        console.log(`[firebird-sync]   ${tableName}: ${result.rowCount} rows (${result.durationMs}ms)`);
      } else if (result.status === 'error') {
        console.error(`[firebird-sync]   ${tableName}: ERROR - ${result.error}`);
      }
    }

    const ok = results.filter((r) => r.status === 'ok').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    const errors = results.filter((r) => r.status === 'error');
    const totalRows = results.reduce((sum, r) => sum + r.rowCount, 0);

    console.log(
      `[firebird-sync] ${name}: done — ${ok}/${tables.length} OK, ${skipped} skipped, ${errors.length} errors, ${totalRows} total rows`
    );

    return { name, tablesTotal: tables.length, tablesOk: ok, tablesSkipped: skipped, tablesError: errors.length, totalRows, errors };
  } finally {
    await fbDetach(fbDb);
  }
}

/**
 * Main sync function — called by cron job.
 * Syncs all configured Firebird databases to PostgreSQL.
 */
export async function syncFirebirdToPostgres() {
  const configs = getFirebirdConfigs();
  const summaries = [];
  const allErrors = [];

  for (const config of configs) {
    if (!config.fb.host) {
      console.warn(`[firebird-sync] Skipping ${config.name} — FIREBIRD_${config.name.toUpperCase()}_HOST not set`);
      continue;
    }

    try {
      const summary = await syncOneDatabase(config);
      summaries.push(summary);
      if (summary.errors.length > 0) {
        allErrors.push(...summary.errors.map((e) => `${config.name}.${e.table}: ${e.error}`));
      }
    } catch (error) {
      console.error(`[firebird-sync] ${config.name}: FATAL - ${error.message}`);
      allErrors.push(`${config.name}: ${error.message}`);
    }
  }

  // Build result for StatusCollector
  const totalTables = summaries.reduce((s, r) => s + r.tablesTotal, 0);
  const totalOk = summaries.reduce((s, r) => s + r.tablesOk, 0);
  const totalRows = summaries.reduce((s, r) => s + r.totalRows, 0);

  const resultMsg = `Synced ${totalOk}/${totalTables} tables (${totalRows} rows) across ${summaries.length} databases`;
  console.log(`[firebird-sync] ${resultMsg}`);

  if (allErrors.length > 0) {
    const err = new Error(`Firebird sync completed with ${allErrors.length} error(s): ${allErrors.join('; ')}`);
    err.context = { totalTables, totalOk, totalRows, errors: allErrors };
    throw err;
  }

  return { totalTables, totalOk, totalRows };
}

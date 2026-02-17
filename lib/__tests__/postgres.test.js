import { describe, test, expect, beforeEach, mock } from 'bun:test';

describe('postgres', () => {
  test('getPool returns a pg.Pool with correct config', async () => {
    // Set env vars for test
    process.env.POSTGRES_HOST = '127.0.0.1';
    process.env.POSTGRES_PORT = '5432';
    process.env.POSTGRES_SYNC_USER = 'fb_sync';
    process.env.POSTGRES_SYNC_PASS = 'testpass';

    // Import fresh module
    const { getPool } = await import('../postgres.js');

    const pool = getPool('testdb');
    expect(pool).toBeDefined();
    expect(pool.options.host).toBe('127.0.0.1');
    expect(pool.options.port).toBe(5432);
    expect(pool.options.user).toBe('fb_sync');
    expect(pool.options.database).toBe('testdb');

    await pool.end();
  });
});

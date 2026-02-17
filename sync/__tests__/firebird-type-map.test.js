import { describe, test, expect } from 'bun:test';
import { mapFirebirdTypeToPg } from '../firebird-type-map.js';

describe('mapFirebirdTypeToPg', () => {
  test('maps INTEGER types', () => {
    expect(mapFirebirdTypeToPg(7, 0, 0, 0, null)).toBe('SMALLINT');   // SHORT
    expect(mapFirebirdTypeToPg(8, 0, 0, 0, null)).toBe('INTEGER');    // LONG
    expect(mapFirebirdTypeToPg(16, 0, 0, 0, null)).toBe('BIGINT');    // INT64
  });

  test('maps FLOAT/DOUBLE', () => {
    expect(mapFirebirdTypeToPg(10, 0, 0, 0, null)).toBe('REAL');               // FLOAT
    expect(mapFirebirdTypeToPg(27, 0, 0, 0, null)).toBe('DOUBLE PRECISION');   // DOUBLE
  });

  test('maps NUMERIC with scale (RDB$FIELD_SCALE is negative)', () => {
    expect(mapFirebirdTypeToPg(7, 0, 5, -2, null)).toBe('NUMERIC(5,2)');
    expect(mapFirebirdTypeToPg(8, 0, 10, -3, null)).toBe('NUMERIC(10,3)');
    expect(mapFirebirdTypeToPg(16, 0, 18, -4, null)).toBe('NUMERIC(18,4)');
  });

  test('maps VARCHAR/CHAR', () => {
    expect(mapFirebirdTypeToPg(37, 100, 0, 0, null)).toBe('VARCHAR(100)'); // VARYING
    expect(mapFirebirdTypeToPg(14, 50, 0, 0, null)).toBe('CHAR(50)');      // TEXT (fixed)
  });

  test('maps DATE/TIME/TIMESTAMP', () => {
    expect(mapFirebirdTypeToPg(12, 0, 0, 0, null)).toBe('DATE');
    expect(mapFirebirdTypeToPg(13, 0, 0, 0, null)).toBe('TIME');
    expect(mapFirebirdTypeToPg(35, 0, 0, 0, null)).toBe('TIMESTAMP');
  });

  test('maps BLOB types', () => {
    expect(mapFirebirdTypeToPg(261, 0, 0, 0, 1)).toBe('TEXT');    // SUB_TYPE TEXT
    expect(mapFirebirdTypeToPg(261, 0, 0, 0, 0)).toBe('BYTEA');   // SUB_TYPE BINARY
  });

  test('falls back to TEXT for unknown types', () => {
    expect(mapFirebirdTypeToPg(999, 0, 0, 0, null)).toBe('TEXT');
  });
});

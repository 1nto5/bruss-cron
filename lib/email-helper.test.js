import { describe, expect, test } from 'bun:test';
import { parseEmailAddresses } from './email-helper.js';

describe('parseEmailAddresses', () => {
  test('returns empty array for null/undefined', () => {
    expect(parseEmailAddresses(null)).toEqual([]);
    expect(parseEmailAddresses(undefined)).toEqual([]);
  });

  test('returns empty array for non-string input', () => {
    expect(parseEmailAddresses(123)).toEqual([]);
    expect(parseEmailAddresses({})).toEqual([]);
    expect(parseEmailAddresses([])).toEqual([]);
  });

  test('returns empty array for empty string', () => {
    expect(parseEmailAddresses('')).toEqual([]);
    expect(parseEmailAddresses('   ')).toEqual([]);
  });

  test('parses single email address', () => {
    expect(parseEmailAddresses('test@example.com')).toEqual(['test@example.com']);
  });

  test('parses multiple comma-separated emails', () => {
    expect(parseEmailAddresses('a@test.com,b@test.com,c@test.com')).toEqual([
      'a@test.com',
      'b@test.com',
      'c@test.com',
    ]);
  });

  test('trims whitespace from emails', () => {
    expect(parseEmailAddresses('  a@test.com  ,  b@test.com  ')).toEqual([
      'a@test.com',
      'b@test.com',
    ]);
  });

  test('filters out empty entries from extra commas', () => {
    expect(parseEmailAddresses('a@test.com,,b@test.com,')).toEqual([
      'a@test.com',
      'b@test.com',
    ]);
  });

  test('handles single email with trailing comma', () => {
    expect(parseEmailAddresses('admin@bruss.pl,')).toEqual(['admin@bruss.pl']);
  });
});

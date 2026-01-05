import { describe, test, expect } from 'bun:test';
import { parseEmailAddresses } from '../email-helper.js';

describe('parseEmailAddresses', () => {
  test('parses single email', () => {
    expect(parseEmailAddresses('test@example.com')).toEqual(['test@example.com']);
  });

  test('parses multiple emails separated by comma', () => {
    expect(parseEmailAddresses('a@b.com,c@d.com')).toEqual(['a@b.com', 'c@d.com']);
  });

  test('trims whitespace from emails', () => {
    expect(parseEmailAddresses(' a@b.com , c@d.com ')).toEqual(['a@b.com', 'c@d.com']);
  });

  test('filters out empty entries', () => {
    expect(parseEmailAddresses('a@b.com,,c@d.com,')).toEqual(['a@b.com', 'c@d.com']);
  });

  test('returns empty array for empty string', () => {
    expect(parseEmailAddresses('')).toEqual([]);
  });

  test('returns empty array for null', () => {
    expect(parseEmailAddresses(null)).toEqual([]);
  });

  test('returns empty array for undefined', () => {
    expect(parseEmailAddresses(undefined)).toEqual([]);
  });

  test('returns empty array for non-string input', () => {
    expect(parseEmailAddresses(123)).toEqual([]);
    expect(parseEmailAddresses({})).toEqual([]);
  });
});

/**
 * Map a Firebird field definition to a PostgreSQL column type.
 *
 * @param {number} fieldType   - RDB$FIELD_TYPE code
 * @param {number} fieldLength - RDB$FIELD_LENGTH (for CHAR/VARCHAR)
 * @param {number} fieldPrecision - RDB$FIELD_PRECISION (for NUMERIC/DECIMAL)
 * @param {number} fieldScale  - RDB$FIELD_SCALE (negative = decimal places)
 * @param {number|null} fieldSubType - RDB$FIELD_SUB_TYPE (for BLOB, NUMERIC)
 * @returns {string} PostgreSQL type declaration
 */
export function mapFirebirdTypeToPg(fieldType, fieldLength, fieldPrecision, fieldScale, fieldSubType) {
  // NUMERIC/DECIMAL: stored as SHORT(7), LONG(8), or INT64(16) with non-zero scale
  if ((fieldType === 7 || fieldType === 8 || fieldType === 16) && fieldScale < 0) {
    const precision = fieldPrecision || 18;
    const scale = Math.abs(fieldScale);
    return `NUMERIC(${precision},${scale})`;
  }

  switch (fieldType) {
    case 7:   return 'SMALLINT';                         // SHORT
    case 8:   return 'INTEGER';                          // LONG
    case 16:  return 'BIGINT';                           // INT64
    case 10:  return 'REAL';                             // FLOAT
    case 27:  return 'DOUBLE PRECISION';                 // DOUBLE
    case 14:  return `CHAR(${fieldLength || 1})`;        // TEXT (fixed-length)
    case 37:  return `VARCHAR(${fieldLength || 255})`;   // VARYING
    case 12:  return 'DATE';
    case 13:  return 'TIME';
    case 35:  return 'TIMESTAMP';
    case 261: return fieldSubType === 1 ? 'TEXT' : 'BYTEA'; // BLOB
    case 23:  return 'BOOLEAN';
    default:  return 'TEXT';                             // safe fallback
  }
}

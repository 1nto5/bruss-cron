/**
 * Reusable HTML email builder helpers.
 *
 * Every inline-CSS value is copied verbatim from the original collector
 * templates so the rendered output stays visually identical.
 */

// ---------------------------------------------------------------------------
// Shared inline CSS constants
// ---------------------------------------------------------------------------

export const STYLES = {
  // Container
  container: 'font-family: Arial, sans-serif; max-width: 800px;',

  // Table
  table: 'width: 100%; border-collapse: collapse; margin: 10px 0;',

  // Cells
  cell: 'padding: 8px; border: 1px solid #ccc;',
  cellCenter: 'padding: 8px; text-align: center; border: 1px solid #ccc;',
  cellSmall: 'font-size: 12px;',

  // Header rows
  headerRow: 'background-color: #e0e0e0;',
  headerRowBlue: 'background-color: #e3f2fd;',

  // Box base (shared padding / radius / margin)
  boxBase: 'padding: 15px; border-radius: 5px; margin: 10px 0;',

  // Box variants (background + optional border-left)
  boxInfo: 'background-color: #f5f5f5;',
  boxError: 'background-color: #ffebee; border-left: 4px solid #f44336;',
  boxErrorAlt: 'background-color: #ffebee; border-left: 4px solid #d32f2f;',
  boxSuccess: 'background-color: #e8f5e8; border-left: 4px solid #4caf50;',
  boxWarning: 'background-color: #fff3cd; border-left: 4px solid #ffc107;',
  boxAttention: 'background-color: #fff3e0; border-left: 4px solid #ff9800;',
  boxBlueInfo: 'background-color: #e3f2fd; border-left: 4px solid #1976d2;',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a <td> element with consistent styling.
 * @param {string} content - Cell inner HTML
 * @param {object} [options]
 * @param {'left'|'center'|'right'} [options.align] - Text alignment
 * @param {string} [options.style] - Extra inline CSS appended after the base
 * @param {string} [options.color] - Text color shorthand
 * @returns {string}
 */
export function tableCell(content, options = {}) {
  const base = options.align === 'center' || options.align === 'right'
    ? `padding: 8px; text-align: ${options.align}; border: 1px solid #ccc;`
    : STYLES.cell;

  const parts = [base];
  if (options.color) parts.push(`color: ${options.color};`);
  if (options.style) parts.push(options.style);

  return `<td style="${parts.join(' ')}">${content}</td>`;
}

/**
 * Generate a <th> element with consistent styling.
 * @param {string} content - Header cell inner HTML
 * @param {object} [options]
 * @param {'left'|'center'|'right'} [options.align='left'] - Text alignment
 * @param {string} [options.style] - Extra inline CSS
 * @returns {string}
 */
export function tableHeaderCell(content, options = {}) {
  const align = options.align || 'left';
  const parts = [`padding: 8px; text-align: ${align}; border: 1px solid #ccc;`];
  if (options.style) parts.push(options.style);
  return `<th style="${parts.join(' ')}">${content}</th>`;
}

/**
 * Open a <table> with an optional header row.
 * @param {string[]} headers - Column header labels
 * @param {object} [options]
 * @param {string[]} [options.widths] - Column widths (e.g. ['40%', '20%'])
 * @param {string} [options.headerRowStyle] - Override for the <tr> background
 * @param {Array<{align?:string}>} [options.columns] - Per-column options
 * @returns {string}
 */
export function tableStart(headers, options = {}) {
  const rowStyle = options.headerRowStyle || STYLES.headerRow;
  const cols = options.columns || [];

  let html = `<table style="${STYLES.table}">`;

  if (headers.length > 0) {
    html += `<thead><tr style="${rowStyle}">`;
    headers.forEach((header, i) => {
      const colOpts = cols[i] || {};
      const align = colOpts.align || (i === 0 ? 'left' : 'center');
      html += tableHeaderCell(header, { align });
    });
    html += '</tr></thead><tbody>';
  }

  return html;
}

/**
 * Close a table opened by tableStart.
 * @returns {string}
 */
export function tableEnd() {
  return '</tbody></table>';
}

/**
 * Styled container div (box) with a type-based colour scheme.
 * @param {string} content - Inner HTML
 * @param {'info'|'error'|'errorAlt'|'success'|'warning'|'attention'|'blueInfo'} type
 * @returns {string}
 */
export function box(content, type) {
  const variantMap = {
    info: STYLES.boxInfo,
    error: STYLES.boxError,
    errorAlt: STYLES.boxErrorAlt,
    success: STYLES.boxSuccess,
    warning: STYLES.boxWarning,
    attention: STYLES.boxAttention,
    blueInfo: STYLES.boxBlueInfo,
  };

  const variant = variantMap[type] || STYLES.boxInfo;
  return `<div style="${STYLES.boxBase} ${variant}">${content}</div>`;
}

/**
 * Outer email wrapper with font-family and max-width.
 * @param {string} content - Full email body HTML
 * @returns {string}
 */
export function container(content) {
  return `<div style="${STYLES.container}">${content}</div>`;
}

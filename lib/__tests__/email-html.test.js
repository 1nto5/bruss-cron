import { describe, test, expect } from 'bun:test';
import {
  STYLES,
  tableCell,
  tableHeaderCell,
  tableStart,
  tableEnd,
  box,
  container,
} from '../email-html.js';

describe('tableCell', () => {
  test('renders left-aligned cell by default', () => {
    const result = tableCell('hello');
    expect(result).toBe('<td style="padding: 8px; border: 1px solid #ccc;">hello</td>');
  });

  test('renders center-aligned cell', () => {
    const result = tableCell('val', { align: 'center' });
    expect(result).toContain('text-align: center');
    expect(result).toContain('val');
  });

  test('applies color option', () => {
    const result = tableCell('x', { color: '#f44336' });
    expect(result).toContain('color: #f44336;');
  });

  test('appends extra style', () => {
    const result = tableCell('x', { align: 'center', style: 'font-weight: bold;' });
    expect(result).toContain('font-weight: bold;');
    expect(result).toContain('text-align: center');
  });

  test('combines color and extra style', () => {
    const result = tableCell('x', { align: 'center', color: '#4caf50', style: 'font-size: 12px;' });
    expect(result).toContain('color: #4caf50;');
    expect(result).toContain('font-size: 12px;');
  });
});

describe('tableHeaderCell', () => {
  test('renders th with left alignment by default', () => {
    const result = tableHeaderCell('Name');
    expect(result).toBe('<th style="padding: 8px; text-align: left; border: 1px solid #ccc;">Name</th>');
  });

  test('renders th with center alignment', () => {
    const result = tableHeaderCell('Count', { align: 'center' });
    expect(result).toContain('text-align: center');
  });
});

describe('tableStart', () => {
  test('opens table with default gray header row', () => {
    const result = tableStart(['A', 'B']);
    expect(result).toContain('<table style="');
    expect(result).toContain('background-color: #e0e0e0;');
    expect(result).toContain('<th');
    expect(result).toContain('<tbody>');
  });

  test('uses custom header row style', () => {
    const result = tableStart(['A'], { headerRowStyle: STYLES.headerRowBlue });
    expect(result).toContain('background-color: #e3f2fd;');
  });

  test('first column defaults to left, rest to center', () => {
    const result = tableStart(['Name', 'Count']);
    expect(result).toContain('text-align: left');
    expect(result).toContain('text-align: center');
  });
});

describe('tableEnd', () => {
  test('closes tbody and table', () => {
    expect(tableEnd()).toBe('</tbody></table>');
  });
});

describe('box', () => {
  test('renders info box with correct styles', () => {
    const result = box('content', 'info');
    expect(result).toContain('background-color: #f5f5f5;');
    expect(result).toContain('padding: 15px; border-radius: 5px; margin: 10px 0;');
    expect(result).toContain('content');
  });

  test('renders error box with red border', () => {
    const result = box('msg', 'error');
    expect(result).toContain('background-color: #ffebee;');
    expect(result).toContain('border-left: 4px solid #f44336;');
  });

  test('renders errorAlt box with d32f2f border', () => {
    const result = box('msg', 'errorAlt');
    expect(result).toContain('background-color: #ffebee;');
    expect(result).toContain('border-left: 4px solid #d32f2f;');
  });

  test('renders success box with green', () => {
    const result = box('ok', 'success');
    expect(result).toContain('background-color: #e8f5e8;');
    expect(result).toContain('border-left: 4px solid #4caf50;');
  });

  test('renders warning box with yellow', () => {
    const result = box('warn', 'warning');
    expect(result).toContain('background-color: #fff3cd;');
    expect(result).toContain('border-left: 4px solid #ffc107;');
  });

  test('renders attention box with orange', () => {
    const result = box('attn', 'attention');
    expect(result).toContain('background-color: #fff3e0;');
    expect(result).toContain('border-left: 4px solid #ff9800;');
  });

  test('renders blueInfo box with blue', () => {
    const result = box('note', 'blueInfo');
    expect(result).toContain('background-color: #e3f2fd;');
    expect(result).toContain('border-left: 4px solid #1976d2;');
  });
});

describe('container', () => {
  test('wraps content with font-family and max-width', () => {
    const result = container('inner');
    expect(result).toContain('font-family: Arial, sans-serif; max-width: 800px;');
    expect(result).toContain('inner');
    expect(result).toMatch(/^<div.*>inner<\/div>$/);
  });
});

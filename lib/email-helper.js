/**
 * Parse email addresses from environment variable
 * Supports both single email and comma-separated list
 * @param {string} emailString - Email address(es) from environment variable
 * @returns {string[]} Array of email addresses
 */
export function parseEmailAddresses(emailString) {
  if (!emailString || typeof emailString !== 'string') {
    return [];
  }

  // Split by comma and trim whitespace from each address
  return emailString
    .split(',')
    .map(email => email.trim())
    .filter(email => email.length > 0);
}

/**
 * Escape HTML special characters to prevent XSS in email templates
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
export function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Build HTML email with optional CTA button
 * @param {string} content - HTML content body
 * @param {string} [buttonUrl] - Optional URL for CTA button
 * @param {string} [buttonText] - Button text (required if buttonUrl provided)
 * @returns {string} Formatted HTML email
 */
export function buildHtml(content, buttonUrl, buttonText) {
  const buttonStyle =
    'display:inline-block;padding:10px 20px;font-size:16px;color:white;background-color:#007bff;text-decoration:none;border-radius:5px;';
  const button = buttonUrl
    ? `<p><a href="${buttonUrl}" style="${buttonStyle}">${buttonText}</a></p>`
    : '';
  return `<div style="font-family:Arial,sans-serif;max-width:600px;">${content}${button}</div>`;
}

/**
 * Build HTML summary table for overtime reports
 * @param {{ displayName?: string, email: string, hours: number, count: number }[]} usersData
 * @returns {string} HTML table markup
 */
export function buildSummaryTable(usersData) {
  const rows = usersData
    .map(
      (u) =>
        `<tr><td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(u.displayName || u.email)}</td><td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${u.hours}h</td><td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${u.count}</td></tr>`
    )
    .join('');
  return `<table style="border-collapse:collapse;margin:10px 0;"><thead><tr><th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Employee</th><th style="padding:4px 8px;border:1px solid #ddd;">Hours</th><th style="padding:4px 8px;border:1px solid #ddd;">Entries</th></tr></thead><tbody>${rows}</tbody></table>`;
}

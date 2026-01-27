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

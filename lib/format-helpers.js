/**
 * Format a date in Polish locale with Warsaw timezone.
 * @param {Date} [date] - Date to format (defaults to current date/time)
 * @returns {string} Formatted date string
 */
export function toWarsawTime(date = new Date()) {
  return date.toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });
}

/**
 * Return a Date object representing N hours ago from now.
 * @param {number} n - Number of hours ago
 * @returns {Date}
 */
export function hoursAgo(n) {
  return new Date(Date.now() - n * 60 * 60 * 1000);
}

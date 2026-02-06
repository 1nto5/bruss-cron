/**
 * Check if today is within the last 7 days of the month
 * @returns {boolean}
 */
export function isWithinLastWeekOfMonth() {
  const today = new Date();
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const daysUntilEnd = lastDayOfMonth.getDate() - today.getDate();
  return daysUntilEnd >= 0 && daysUntilEnd <= 6;
}

/**
 * Check if today is the last day of the month
 * @returns {boolean}
 */
export function isLastDayOfMonth() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  return tomorrow.getDate() === 1;
}

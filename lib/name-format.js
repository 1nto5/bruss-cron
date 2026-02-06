/**
 * Extract full name from a bruss-group.com email address.
 * e.g. "jan.kowalski@bruss-group.com" -> "Jan Kowalski"
 * @param {string} email
 * @returns {string}
 */
export function extractFullNameFromEmail(email) {
  const nameParts = email.split('@')[0].split('.');
  const firstName = nameParts[0];
  const lastName = nameParts.length > 1 ? nameParts[1] : '';
  return (
    firstName.charAt(0).toUpperCase() +
    firstName.slice(1) +
    ' ' +
    lastName.charAt(0).toUpperCase() +
    lastName.slice(1)
  );
}

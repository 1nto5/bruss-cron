import axios from 'axios';
import { dbc } from '../lib/mongo.js';
import { buildHtml } from '../lib/email-helper.js';

const COLLECTION_EMPLOYEES = 'employees';
const COLLECTION_NOTIFICATIONS = 'competency_matrix_evaluation_notifications';

/**
 * Send email notifications to managers 30 days before an employee's fixed-term contract ends,
 * prompting them to create a performance evaluation.
 */
export async function sendContractEndEvaluationNotifications() {
  const startTime = new Date();
  console.log(`[contract-end-notifications] Starting at ${startTime.toISOString()}`);

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const employeesColl = await dbc(COLLECTION_EMPLOYEES);
  const notificationsColl = await dbc(COLLECTION_NOTIFICATIONS);

  // Find employees with fixed-term contracts ending within 30 days
  const employees = await employeesColl
    .find({
      endDate: { $ne: null, $gt: now, $lte: thirtyDaysFromNow },
    })
    .toArray();

  console.log(`[contract-end-notifications] Found ${employees.length} employees with contracts ending within 30 days`);

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const emp of employees) {
    try {
      // Check if notification was already sent for this contract end date
      const existing = await notificationsColl.findOne({
        employeeIdentifier: emp.identifier,
        contractEndDate: emp.endDate,
      });

      if (existing) {
        skipped++;
        continue;
      }

      // Resolve manager email
      let managerEmail = null;
      if (emp.manager) {
        const managerRecord = await findManagerByName(employeesColl, emp.manager);
        if (managerRecord?.email) {
          managerEmail = managerRecord.email;
        }
      }

      if (!managerEmail) {
        console.warn(`[contract-end-notifications] No manager email found for ${emp.identifier} (manager: ${emp.manager || 'none'})`);
        errors++;
        continue;
      }

      // Build email
      const appUrl = process.env.APP_URL || 'https://intra.bruss-group.com';
      const lang = process.env.LANG?.substring(0, 2) || 'pl';
      const evaluationUrl = `${appUrl}/${lang}/competency-matrix/evaluations/create?employee=${emp.identifier}`;

      const endDateFormatted = new Date(emp.endDate).toLocaleDateString('pl-PL');
      const employeeName = `${emp.firstName} ${emp.lastName}`;

      const subject = `Zbliża się koniec umowy: ${employeeName} (${endDateFormatted})`;
      const content = `
        <p>Dzień dobry,</p>
        <p>Informujemy, że umowa pracownika <strong>${employeeName}</strong> (nr ${emp.identifier}) wygasa w dniu <strong>${endDateFormatted}</strong>.</p>
        <p><strong>Stanowisko:</strong> ${emp.position || '-'}<br/>
        <strong>Dział:</strong> ${emp.department || '-'}</p>
        <p>Prosimy o przeprowadzenie oceny pracownika przed zakończeniem umowy.</p>
      `;

      const html = buildHtml(content, evaluationUrl, 'Utwórz ocenę');

      await axios.post(`${process.env.API_URL}/mailer`, {
        to: managerEmail,
        subject,
        html,
      });

      // Track notification
      await notificationsColl.insertOne({
        employeeIdentifier: emp.identifier,
        contractEndDate: emp.endDate,
        managerEmail,
        sentAt: new Date(),
      });

      sent++;
      console.log(`[contract-end-notifications] Sent notification for ${emp.identifier} to ${managerEmail}`);

      // Small delay between emails
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`[contract-end-notifications] Error processing ${emp.identifier}:`, error.message);
      errors++;
    }
  }

  const duration = Math.round((Date.now() - startTime.getTime()) / 1000);
  console.log(`[contract-end-notifications] Completed in ${duration}s | Sent: ${sent} | Skipped: ${skipped} | Errors: ${errors}`);
}

/**
 * Find a manager's employee record by name string (e.g., "Michał Dudziak").
 * Tries both "firstName lastName" and "lastName firstName" orderings.
 */
async function findManagerByName(employeesColl, managerName) {
  if (!managerName) return null;

  const parts = managerName.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const [a, ...rest] = parts;
  const b = rest.join(' ');

  return employeesColl.findOne({
    $or: [
      { firstName: a, lastName: b },
      { firstName: b, lastName: a },
    ],
  });
}

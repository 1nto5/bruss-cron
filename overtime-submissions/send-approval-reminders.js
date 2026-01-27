import axios from 'axios';
import dotenv from 'dotenv';
import { dbc } from '../lib/mongo.js';
import { buildHtml } from '../lib/email-helper.js';

dotenv.config();

async function sendOvertimeSubmissionsApprovalReminders() {
  let pendingCount = 0;
  let supervisorEmailsSent = 0;
  let emailErrors = 0;

  try {
    const coll = await dbc('overtime_submissions');

    // Group pending submissions by supervisor
    const pendingBySupervisor = await coll
      .aggregate([
        { $match: { status: 'pending' } },
        { $group: { _id: '$supervisor', count: { $sum: 1 } } },
      ])
      .toArray();

    pendingCount = pendingBySupervisor.reduce((sum, s) => sum + s.count, 0);

    const submissionsUrl = `${process.env.APP_URL}/overtime-submissions/balances`;

    // Send to supervisors
    for (const { _id: supervisorEmail, count } of pendingBySupervisor) {
      if (!supervisorEmail) continue;

      const subject = 'Overtime submissions awaiting approval';
      const message = `You have ${count} overtime submission${count === 1 ? '' : 's'} awaiting your approval.`;
      const html = buildHtml(`<p>${message}</p>`, submissionsUrl, 'Go to overtime');

      try {
        await axios.post(`${process.env.API_URL}/mailer`, {
          to: supervisorEmail,
          subject,
          html,
        });
        supervisorEmailsSent++;
      } catch (error) {
        console.error(`Error sending email to supervisor ${supervisorEmail}:`, error.message);
        emailErrors++;
      }
    }
  } catch (error) {
    console.error('Error in sendOvertimeSubmissionsApprovalReminders:', error);
    throw error;
  }

  console.log(
    `sendOvertimeSubmissionsApprovalReminders -> success at ${new Date().toLocaleString()} | ` +
      `Pending: ${pendingCount} (emails: ${supervisorEmailsSent}), Errors: ${emailErrors}`
  );
}

export { sendOvertimeSubmissionsApprovalReminders };

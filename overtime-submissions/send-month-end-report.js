import axios from 'axios';
import { dbc } from '../lib/mongo.js';
import { buildHtml, buildSummaryTable } from '../lib/email-helper.js';
import { isLastDayOfMonth } from '../lib/date-helpers.js';
import { extractFullNameFromEmail } from '../lib/name-format.js';

export async function sendOvertimeSubmissionMonthEndReport() {
  if (!isLastDayOfMonth()) {
    console.log(`sendOvertimeSubmissionMonthEndReport -> skipped (not last day of month)`);
    return { skipped: true, reason: 'not last day of month' };
  }

  let usersWithBalance = 0;
  let plantManagerCount = 0;
  let emailsSent = 0;
  let emailErrors = 0;

  try {
    const coll = await dbc('overtime_submissions');
    const usersColl = await dbc('users');

    const pipeline = [
      {
        $match: {
          status: 'approved',
          payment: { $ne: true },
          scheduledDayOff: { $exists: false },
        },
      },
      {
        $group: {
          _id: '$submittedBy',
          totalHours: { $sum: '$hours' },
        },
      },
      { $match: { totalHours: { $ne: 0 } } },
      { $sort: { totalHours: -1 } },
    ];

    const userBalances = await coll.aggregate(pipeline).toArray();
    usersWithBalance = userBalances.length;

    if (usersWithBalance === 0) {
      console.log(`sendOvertimeSubmissionMonthEndReport -> success | No users with unsettled overtime`);
      return { success: true, usersWithBalance: 0, emailsSent: 0, emailErrors: 0 };
    }

    const usersData = userBalances.map((u) => ({
      email: u._id,
      displayName: extractFullNameFromEmail(u._id),
      hours: u.totalHours,
    }));

    const plantManagers = await usersColl.find({ roles: { $in: ['plant-manager'] } }).toArray();
    plantManagerCount = plantManagers.length;

    if (plantManagerCount === 0) {
      console.log(`sendOvertimeSubmissionMonthEndReport -> warning | No plant managers found`);
      return { success: true, usersWithBalance, emailsSent: 0, emailErrors: 0, warning: 'no plant managers' };
    }

    const overtimeUrl = `${process.env.APP_URL}/overtime-submissions/balances`;
    const table = buildSummaryTable(usersData);
    const content = `<p>Below is a list of employees with unsettled overtime at month end:</p>${table}<p>You can mark selected entries for payout in the system.</p>`;

    for (const manager of plantManagers) {
      if (!manager.email) continue;

      try {
        const subject = 'Report: unsettled overtime hours - month end';
        const html = buildHtml(content, overtimeUrl, 'Go to overtime');

        await axios.post(`${process.env.API_URL}/mailer`, {
          to: manager.email,
          subject,
          html,
        });
        emailsSent++;
      } catch (error) {
        console.error(`Error sending month-end report to ${manager.email}:`, error.message);
        emailErrors++;
      }
    }
  } catch (error) {
    console.error('Error in sendOvertimeSubmissionMonthEndReport:', error);
    throw error;
  }

  console.log(
    `sendOvertimeSubmissionMonthEndReport -> success | Users: ${usersWithBalance}, PMs: ${plantManagerCount}, Emails: ${emailsSent}, Errors: ${emailErrors}`
  );

  return { success: true, usersWithBalance, plantManagerCount, emailsSent, emailErrors };
}

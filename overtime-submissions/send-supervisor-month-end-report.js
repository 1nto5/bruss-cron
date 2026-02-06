import axios from 'axios';
import { dbc } from '../lib/mongo.js';
import { buildHtml, buildSummaryTable } from '../lib/email-helper.js';
import { isWithinLastWeekOfMonth } from '../lib/date-helpers.js';
import { extractFullNameFromEmail } from '../lib/name-format.js';

export async function sendSupervisorMonthEndReport() {
  if (!isWithinLastWeekOfMonth()) {
    console.log(`sendSupervisorMonthEndReport -> skipped (not within last 7 days of month)`);
    return { skipped: true, reason: 'not within last 7 days of month' };
  }

  let supervisorCount = 0;
  let emailsSent = 0;
  let emailErrors = 0;

  try {
    const coll = await dbc('overtime_submissions');

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
          _id: { supervisor: '$supervisor', employee: '$submittedBy' },
          totalHours: { $sum: '$hours' },
          count: { $sum: 1 },
        },
      },
      { $match: { totalHours: { $ne: 0 } } },
      {
        $group: {
          _id: '$_id.supervisor',
          employees: {
            $push: {
              email: '$_id.employee',
              hours: '$totalHours',
              count: '$count',
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const supervisorBalances = await coll.aggregate(pipeline).toArray();
    supervisorCount = supervisorBalances.length;

    if (supervisorCount === 0) {
      console.log(`sendSupervisorMonthEndReport -> success | No supervisors with employees having unsettled overtime`);
      return { success: true, supervisorCount: 0, emailsSent: 0, emailErrors: 0 };
    }

    const overtimeUrl = `${process.env.APP_URL}/overtime-submissions/balances`;

    for (const { _id: supervisorEmail, employees } of supervisorBalances) {
      if (!supervisorEmail) continue;

      try {
        const usersData = employees
          .map((e) => ({
            email: e.email,
            displayName: extractFullNameFromEmail(e.email),
            hours: e.hours,
            count: e.count,
          }))
          .sort((a, b) => b.hours - a.hours);

        const table = buildSummaryTable(usersData);
        const content = `<p>Below is a list of your employees with unsettled overtime:</p>${table}<p>Please contact these employees about settling their overtime.</p>`;

        const subject = 'Report: unsettled overtime - your employees';
        const html = buildHtml(content, overtimeUrl, 'Go to overtime');

        await axios.post(`${process.env.API_URL}/mailer`, {
          to: supervisorEmail,
          subject,
          html,
        });
        emailsSent++;
      } catch (error) {
        console.error(`Error sending supervisor month-end report to ${supervisorEmail}:`, error.message);
        emailErrors++;
      }
    }
  } catch (error) {
    console.error('Error in sendSupervisorMonthEndReport:', error);
    throw error;
  }

  console.log(
    `sendSupervisorMonthEndReport -> success | Supervisors: ${supervisorCount}, Emails: ${emailsSent}, Errors: ${emailErrors}`
  );

  return { success: true, supervisorCount, emailsSent, emailErrors };
}

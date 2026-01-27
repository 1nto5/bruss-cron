import axios from 'axios';
import dotenv from 'dotenv';
import { dbc } from '../lib/mongo.js';
import { buildHtml } from '../lib/email-helper.js';

dotenv.config();

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isWithinLastWeekOfMonth() {
  const today = new Date();
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const daysUntilEnd = lastDayOfMonth.getDate() - today.getDate();
  return daysUntilEnd >= 0 && daysUntilEnd <= 6;
}

function buildSummaryTable(usersData) {
  const rows = usersData
    .map(
      (u) =>
        `<tr><td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(u.displayName || u.email)}</td><td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${u.hours}h</td><td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${u.count}</td></tr>`
    )
    .join('');
  return `<table style="border-collapse:collapse;margin:10px 0;"><thead><tr><th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Employee</th><th style="padding:4px 8px;border:1px solid #ddd;">Hours</th><th style="padding:4px 8px;border:1px solid #ddd;">Entries</th></tr></thead><tbody>${rows}</tbody></table>`;
}

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

    const allEmployeeEmails = supervisorBalances.flatMap((s) => s.employees.map((e) => e.email));
    const users = await usersColl.find({ email: { $in: allEmployeeEmails } }).toArray();
    const userMap = new Map(users.map((u) => [u.email, u.displayName]));

    const overtimeUrl = `${process.env.APP_URL}/overtime-submissions/balances`;

    for (const { _id: supervisorEmail, employees } of supervisorBalances) {
      if (!supervisorEmail) continue;

      try {
        const usersData = employees
          .map((e) => ({
            email: e.email,
            displayName: userMap.get(e.email) || e.email,
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

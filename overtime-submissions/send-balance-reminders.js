import axios from 'axios';
import { dbc } from '../lib/mongo.js';
import { buildHtml } from '../lib/email-helper.js';
import { isWithinLastWeekOfMonth } from '../lib/date-helpers.js';

export async function sendOvertimeSubmissionBalanceReminders() {
  if (!isWithinLastWeekOfMonth()) {
    console.log(`sendOvertimeSubmissionBalanceReminders -> skipped (not last week of month)`);
    return { skipped: true, reason: 'not last week of month' };
  }

  let usersWithBalance = 0;
  let emailsSent = 0;
  let emailErrors = 0;

  try {
    const coll = await dbc('overtime_submissions');

    const pipeline = [
      {
        $match: {
          status: { $nin: ['cancelled'] },
          payment: { $ne: true },
          scheduledDayOff: { $exists: false },
        },
      },
      {
        $group: {
          _id: '$submittedBy',
          totalHours: { $sum: '$hours' },
          count: { $sum: 1 },
        },
      },
      {
        $match: { totalHours: { $ne: 0 } },
      },
    ];

    const userBalances = await coll.aggregate(pipeline).toArray();
    usersWithBalance = userBalances.length;

    if (usersWithBalance === 0) {
      console.log(`sendOvertimeSubmissionBalanceReminders -> success | No users with balance`);
      return { success: true, usersWithBalance: 0, emailsSent: 0, emailErrors: 0 };
    }

    const overtimeUrl = `${process.env.APP_URL}/overtime-submissions`;

    for (const { _id: userEmail, totalHours } of userBalances) {
      if (!userEmail) continue;

      try {
        const subject = 'Masz nierozliczone nadgodziny / You have unsettled overtime';
        const messagePL = `Proszę o rozliczenie zaległych nadgodzin. Aktualne saldo: <strong>${totalHours}h</strong>.`;
        const messageEN = `Please settle your outstanding overtime. Current balance: <strong>${totalHours}h</strong>.`;

        const html = buildHtml(
          `<p>${messagePL}</p><hr style="border:none;border-top:1px solid #ddd;margin:16px 0;"/><p>${messageEN}</p>`,
          overtimeUrl,
          'Przejdź do nadgodzin / Go to overtime'
        );

        await axios.post(`${process.env.API_URL}/mailer`, {
          to: userEmail,
          subject,
          html,
        });
        emailsSent++;
      } catch (error) {
        console.error(`Error sending balance reminder to ${userEmail}:`, error.message);
        emailErrors++;
      }
    }
  } catch (error) {
    console.error('Error in sendOvertimeSubmissionBalanceReminders:', error);
    throw error;
  }

  console.log(
    `sendOvertimeSubmissionBalanceReminders -> success | Users: ${usersWithBalance}, Emails: ${emailsSent}, Errors: ${emailErrors}`
  );

  return { success: true, usersWithBalance, emailsSent, emailErrors };
}

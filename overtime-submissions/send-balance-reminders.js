import axios from 'axios';
import dotenv from 'dotenv';
import { dbc } from '../lib/mongo.js';

dotenv.config();

function isWithinLastWeekOfMonth() {
  const today = new Date();
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const daysUntilEnd = lastDayOfMonth.getDate() - today.getDate();
  return daysUntilEnd >= 0 && daysUntilEnd <= 6;
}

function buildHtml(content, buttonUrl, buttonText) {
  const buttonStyle =
    'display:inline-block;padding:10px 20px;font-size:16px;color:white;background-color:#007bff;text-decoration:none;border-radius:5px;';
  const button = buttonUrl
    ? `<p><a href="${buttonUrl}" style="${buttonStyle}">${buttonText}</a></p>`
    : '';
  return `<div style="font-family:Arial,sans-serif;max-width:600px;">${content}${button}</div>`;
}

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
          status: { $nin: ['accounted', 'cancelled'] },
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
        const subject = 'Przypomnienie: nierozliczone nadgodziny';
        const message =
          totalHours > 0
            ? `Masz ${totalHours}h nadgodzin do odbioru. Rozlicz je przed końcem miesiąca lub zostaną przekazane do wypłaty.`
            : `Masz ${Math.abs(totalHours)}h do odpracowania. Rozlicz przed końcem miesiąca.`;

        const html = buildHtml(`<p>${message}</p>`, overtimeUrl, 'Przejdź do nadgodzin');

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

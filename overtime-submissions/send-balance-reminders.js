import axios from 'axios';
import dotenv from 'dotenv';
import { dbc } from '../lib/mongo.js';
import {
  OVERTIME_SUBMISSIONS,
  trilingualSubject,
  trilingualHtml,
} from '../lib/email-translations.js';

dotenv.config();

/**
 * Check if today is within 7 days before the end of the month
 */
function isWithinLastWeekOfMonth() {
  const today = new Date();
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const daysUntilEnd = lastDayOfMonth.getDate() - today.getDate();
  return daysUntilEnd >= 0 && daysUntilEnd <= 6;
}

/**
 * Sends daily reminders to users with unsettled overtime hours
 * Runs only during the last 7 days of the month
 */
export async function sendOvertimeSubmissionBalanceReminders() {
  // Exit early if not in the last week of month
  if (!isWithinLastWeekOfMonth()) {
    console.log(
      `sendOvertimeSubmissionBalanceReminders -> skipped (not last week of month)`
    );
    return { skipped: true, reason: 'not last week of month' };
  }

  let usersWithBalance = 0;
  let emailsSent = 0;
  let emailErrors = 0;

  try {
    const coll = await dbc('overtime_submissions');
    const usersColl = await dbc('users');

    // Aggregate unclaimed hours per user
    // Exclude: accounted, cancelled, payment=true, scheduledDayOff set
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
        $match: {
          totalHours: { $ne: 0 },
        },
      },
    ];

    const userBalances = await coll.aggregate(pipeline).toArray();
    usersWithBalance = userBalances.length;

    if (usersWithBalance === 0) {
      console.log(
        `sendOvertimeSubmissionBalanceReminders -> success | No users with balance`
      );
      return { success: true, usersWithBalance: 0, emailsSent: 0, emailErrors: 0 };
    }

    const overtimeUrl = `${process.env.APP_URL}/overtime-submissions`;

    for (const userBalance of userBalances) {
      const userEmail = userBalance._id;
      const totalHours = userBalance.totalHours;

      if (!userEmail) continue;

      try {
        const subject = trilingualSubject(OVERTIME_SUBMISSIONS.subjects.balanceReminder);
        const messages = totalHours > 0
          ? OVERTIME_SUBMISSIONS.messages.balancePositive(totalHours)
          : OVERTIME_SUBMISSIONS.messages.balanceNegative(totalHours);

        const html = trilingualHtml(
          { PL: `<p>${messages.PL}</p>`, EN: `<p>${messages.EN}</p>`, DE: `<p>${messages.DE}</p>` },
          overtimeUrl,
          OVERTIME_SUBMISSIONS.buttons.goToSubmissions
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

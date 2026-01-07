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
 * Check if today is the last day of the month
 */
function isLastDayOfMonth() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  return tomorrow.getDate() === 1;
}

/**
 * Sends a report to plant managers with list of users who have unsettled overtime
 * Runs on the last day of the month - does NOT modify any data
 */
export async function sendOvertimeSubmissionMonthEndReport() {
  // Exit early if not the last day of month
  if (!isLastDayOfMonth()) {
    console.log(
      `sendOvertimeSubmissionMonthEndReport -> skipped (not last day of month)`
    );
    return { skipped: true, reason: 'not last day of month' };
  }

  let usersWithBalance = 0;
  let plantManagerCount = 0;
  let emailsSent = 0;
  let emailErrors = 0;

  try {
    const coll = await dbc('overtime_submissions');
    const usersColl = await dbc('users');

    // Aggregate unclaimed hours per user
    // Only approved entries without payment/scheduledDayOff
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
          count: { $sum: 1 },
        },
      },
      {
        $match: {
          totalHours: { $ne: 0 },
        },
      },
      {
        $sort: { totalHours: -1 },
      },
    ];

    const userBalances = await coll.aggregate(pipeline).toArray();
    usersWithBalance = userBalances.length;

    if (usersWithBalance === 0) {
      console.log(
        `sendOvertimeSubmissionMonthEndReport -> success | No users with unsettled overtime`
      );
      return { success: true, usersWithBalance: 0, emailsSent: 0, emailErrors: 0 };
    }

    // Get display names for users
    const userEmails = userBalances.map(u => u._id);
    const users = await usersColl.find({ email: { $in: userEmails } }).toArray();
    const userMap = new Map(users.map(u => [u.email, u.displayName]));

    const usersData = userBalances.map(u => ({
      email: u._id,
      displayName: userMap.get(u._id) || u._id,
      hours: u.totalHours,
      count: u.count,
    }));

    // Get plant managers
    const plantManagers = await usersColl
      .find({ roles: { $in: ['plant-manager'] } })
      .toArray();

    plantManagerCount = plantManagers.length;

    if (plantManagerCount === 0) {
      console.log(
        `sendOvertimeSubmissionMonthEndReport -> warning | No plant managers found`
      );
      return { success: true, usersWithBalance, emailsSent: 0, emailErrors: 0, warning: 'no plant managers' };
    }

    const overtimeUrl = `${process.env.APP_URL}/overtime-submissions`;

    for (const manager of plantManagers) {
      if (!manager.email) continue;

      try {
        const subject = trilingualSubject(OVERTIME_SUBMISSIONS.subjects.monthEndReport);
        const messages = OVERTIME_SUBMISSIONS.messages.monthEndSummary(usersData);

        const html = trilingualHtml(
          messages,
          overtimeUrl,
          OVERTIME_SUBMISSIONS.buttons.goToSubmissions
        );

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

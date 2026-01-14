import axios from 'axios';
import dotenv from 'dotenv';
import { dbc } from '../lib/mongo.js';

dotenv.config();

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isLastDayOfMonth() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  return tomorrow.getDate() === 1;
}

function buildHtml(content, buttonUrl, buttonText) {
  const buttonStyle =
    'display:inline-block;padding:10px 20px;font-size:16px;color:white;background-color:#007bff;text-decoration:none;border-radius:5px;';
  const button = buttonUrl
    ? `<p><a href="${buttonUrl}" style="${buttonStyle}">${buttonText}</a></p>`
    : '';
  return `<div style="font-family:Arial,sans-serif;max-width:600px;">${content}${button}</div>`;
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
          count: { $sum: 1 },
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

    const userEmails = userBalances.map((u) => u._id);
    const users = await usersColl.find({ email: { $in: userEmails } }).toArray();
    const userMap = new Map(users.map((u) => [u.email, u.displayName]));

    const usersData = userBalances.map((u) => ({
      email: u._id,
      displayName: userMap.get(u._id) || u._id,
      hours: u.totalHours,
      count: u.count,
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

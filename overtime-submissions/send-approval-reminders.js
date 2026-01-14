import axios from 'axios';
import dotenv from 'dotenv';
import { dbc } from '../lib/mongo.js';

dotenv.config();

function buildHtml(content, buttonUrl, buttonText) {
  const buttonStyle =
    'display:inline-block;padding:10px 20px;font-size:16px;color:white;background-color:#007bff;text-decoration:none;border-radius:5px;';
  const button = buttonUrl
    ? `<p><a href="${buttonUrl}" style="${buttonStyle}">${buttonText}</a></p>`
    : '';
  return `<div style="font-family:Arial,sans-serif;max-width:600px;">${content}${button}</div>`;
}

async function sendOvertimeSubmissionsApprovalReminders() {
  let pendingForSupervisors = 0;
  let pendingForPlantManagers = 0;
  let supervisorEmailsSent = 0;
  let plantManagerEmailsSent = 0;
  let emailErrors = 0;

  try {
    const coll = await dbc('overtime_submissions');
    const usersColl = await dbc('users');

    const pendingBySupervisor = await coll
      .aggregate([
        { $match: { status: 'pending' } },
        { $group: { _id: '$supervisor', count: { $sum: 1 } } },
      ])
      .toArray();

    const pendingPlantManagerCount = await coll.countDocuments({
      status: 'pending-plant-manager',
    });

    pendingForSupervisors = pendingBySupervisor.reduce((sum, s) => sum + s.count, 0);
    pendingForPlantManagers = pendingPlantManagerCount;

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

    // Send to plant managers
    if (pendingForPlantManagers > 0) {
      const plantManagers = await usersColl
        .find({ roles: { $in: ['plant-manager'] } })
        .toArray();

      for (const manager of plantManagers) {
        if (!manager.email) continue;

        const subject = 'Overtime submissions awaiting approval (payout)';
        const message = `You have ${pendingForPlantManagers} overtime submission${pendingForPlantManagers === 1 ? '' : 's'} (payout) awaiting your approval.`;
        const html = buildHtml(`<p>${message}</p>`, submissionsUrl, 'Go to overtime');

        try {
          await axios.post(`${process.env.API_URL}/mailer`, {
            to: manager.email,
            subject,
            html,
          });
          plantManagerEmailsSent++;
        } catch (error) {
          console.error(`Error sending email to plant-manager:`, error.message);
          emailErrors++;
        }
      }
    }
  } catch (error) {
    console.error('Error in sendOvertimeSubmissionsApprovalReminders:', error);
    throw error;
  }

  console.log(
    `sendOvertimeSubmissionsApprovalReminders -> success at ${new Date().toLocaleString()} | ` +
      `Supervisors: ${pendingForSupervisors} (emails: ${supervisorEmailsSent}), ` +
      `PlantMgr: ${pendingForPlantManagers} (emails: ${plantManagerEmailsSent}), ` +
      `Errors: ${emailErrors}`
  );
}

export { sendOvertimeSubmissionsApprovalReminders };

import axios from 'axios';
import dotenv from 'dotenv';
import { dbc } from '../lib/mongo.js';
import {
  OVERTIME_SUBMISSIONS,
  trilingualSubject,
  trilingualHtml,
} from '../lib/email-translations.js';

dotenv.config();

// Helper function to create trilingual email content
function createEmailContent(messages, submissionsUrl) {
  return trilingualHtml(
    { PL: `<p>${messages.PL}</p>`, EN: `<p>${messages.EN}</p>`, DE: `<p>${messages.DE}</p>` },
    submissionsUrl,
    OVERTIME_SUBMISSIONS.buttons.goToSubmissions
  );
}

/**
 * Sends email notifications about pending overtime submissions
 * - Supervisors: pending submissions assigned to them
 * - Plant managers: pending-plant-manager submissions (awaiting final approval for payment requests)
 */
async function sendOvertimeSubmissionsApprovalReminders() {
  let pendingForSupervisors = 0;
  let pendingForPlantManagers = 0;
  let supervisorEmailsSent = 0;
  let plantManagerEmailsSent = 0;
  let emailErrors = 0;

  try {
    const coll = await dbc('overtime_submissions');
    const usersColl = await dbc('users');

    // Query 1: Pending submissions grouped by supervisor
    const pendingBySupervisor = await coll
      .aggregate([
        { $match: { status: 'pending' } },
        { $group: { _id: '$supervisor', count: { $sum: 1 } } },
      ])
      .toArray();

    // Query 2: Pending-plant-manager submissions (awaiting final approval)
    const pendingPlantManagerCount = await coll.countDocuments({
      status: 'pending-plant-manager',
    });

    pendingForSupervisors = pendingBySupervisor.reduce((sum, s) => sum + s.count, 0);
    pendingForPlantManagers = pendingPlantManagerCount;

    const submissionsUrl = `${process.env.APP_URL}/overtime-submissions`;

    // Send to supervisors if there are pending submissions
    if (pendingBySupervisor.length > 0) {
      for (const { _id: supervisorEmail, count } of pendingBySupervisor) {
        if (!supervisorEmail) continue;

        const subject = trilingualSubject(OVERTIME_SUBMISSIONS.subjects.pendingSupervisorApproval);
        const messages = OVERTIME_SUBMISSIONS.messages.pendingSupervisorCount(count);
        const html = createEmailContent(messages, submissionsUrl);

        try {
          if (!process.env.API_URL) {
            throw new Error('API environment variable is not defined');
          }

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
    }

    // Send to plant managers if there are pending-plant-manager submissions
    if (pendingForPlantManagers > 0) {
      const plantManagers = await usersColl
        .find({ roles: { $in: ['plant-manager'] } })
        .toArray();

      for (const manager of plantManagers) {
        if (!manager.email) continue;

        const subject = trilingualSubject(OVERTIME_SUBMISSIONS.subjects.pendingPlantManagerApproval);
        const messages = OVERTIME_SUBMISSIONS.messages.pendingPlantManagerCount(pendingForPlantManagers);
        const html = createEmailContent(messages, submissionsUrl);

        try {
          if (!process.env.API_URL) {
            throw new Error('API environment variable is not defined');
          }

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

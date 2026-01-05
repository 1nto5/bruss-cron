import axios from 'axios';
import dotenv from 'dotenv';
import { dbc } from '../lib/mongo.js';
import {
  DEVIATIONS,
  trilingualSubject,
  trilingualHtml,
} from '../lib/email-translations.js';

dotenv.config();

// Helper function to create trilingual email content
function createEmailContent(messages, deviationUrl) {
  return trilingualHtml(
    { PL: `<p>${messages.PL}</p>`, EN: `<p>${messages.EN}</p>`, DE: `<p>${messages.DE}</p>` },
    deviationUrl,
    DEVIATIONS.buttons.goToDeviation
  );
}

async function sendDeviationApprovalReminders() {
  const deviationsColl = await dbc('deviations');
  const usersColl = await dbc('users');

  const now = new Date();
  const threshold = new Date(now.getTime() - 72 * 60 * 60 * 1000); // 72h ago

  const pendingDeviations = await deviationsColl
    .find({
      status: 'in approval',
      createdAt: { $lte: threshold },
    })
    .toArray();

  if (pendingDeviations.length === 0) {
    console.log(
      `sendDeviationApprovalReminders -> success at ${now.toLocaleString()} | Processed: 0, Reminders: 0`
    );
    return;
  }

  let remindersSent = 0;
  let emailErrors = 0;

  for (const deviation of pendingDeviations) {
    // Array to collect notification logs for this deviation
    const notificationLogs = [];

    const deviationUrl = `${process.env.APP_URL}/deviations/${deviation._id}`;
    const approvalMap = {
      'group-leader': deviation.groupLeaderApproval,
      'quality-manager': deviation.qualityManagerApproval,
      'production-manager': deviation.productionManagerApproval,
    };

    const lastApprovalTime = [
      deviation.groupLeaderApproval?.at,
      deviation.qualityManagerApproval?.at,
      deviation.productionManagerApproval?.at,
    ]
      .filter(Boolean)
      .map((d) => new Date(d))
      .sort((a, b) => b.getTime() - a.getTime())[0];

    const plantManagerShouldBeNotified =
      Object.values(approvalMap).every((a) => a?.approved === true) &&
      lastApprovalTime &&
      lastApprovalTime <= threshold;

    if (plantManagerShouldBeNotified) {
      const plantManagers = await usersColl
        .find({ roles: 'plant-manager' })
        .toArray();

      for (const pm of plantManagers) {
        if (!pm.email) continue;

        const subjectTranslations = DEVIATIONS.subjects.plantManagerFinal(deviation.internalId);
        const subject = trilingualSubject(subjectTranslations);
        const messages = DEVIATIONS.messages.plantManagerFinal(deviation.internalId);
        const html = createEmailContent(messages, deviationUrl);

        try {
          await axios.post(`${process.env.API_URL}/mailer`, {
            to: pm.email,
            subject,
            html,
          });

          // Log the notification
          notificationLogs.push({
            to: pm.email,
            sentAt: new Date(),
            type: 'reminder-plant-manager',
          });

          remindersSent++;
        } catch (e) {
          console.error(`Error sending plant manager reminder to ${pm.email}:`, e.message);
          emailErrors++;
        }
      }
    }

    for (const [role, approval] of Object.entries(approvalMap)) {
      if (approval?.approved !== undefined) continue; // already decided

      if (role === 'group-leader') {
        const targetRole = `group-leader-${deviation.area}`;
        const groupLeaders = await usersColl
          .find({ roles: { $all: ['group-leader', targetRole] } })
          .toArray();

        if (groupLeaders.length === 0) {
          // vacancy, notify plant manager
          const managers = await usersColl
            .find({ roles: 'plant-manager' })
            .toArray();
          for (const pm of managers) {
            if (!pm.email) continue;
            const subjectTranslations = DEVIATIONS.subjects.vacancy(deviation.internalId, role);
            const subject = trilingualSubject(subjectTranslations);
            const messages = DEVIATIONS.messages.vacancy(deviation.internalId, role);
            const html = createEmailContent(messages, deviationUrl);
            try {
              await axios.post(`${process.env.API_URL}/mailer`, {
                to: pm.email,
                subject,
                html,
              });

              // Log the notification
              notificationLogs.push({
                to: pm.email,
                sentAt: new Date(),
                type: `reminder-vacancy-${role}`,
              });

              remindersSent++;
            } catch (e) {
              console.error(`Error sending vacancy mail to ${pm.email}:`, e.message);
              emailErrors++;
            }
          }
          continue;
        }

        for (const user of groupLeaders) {
          if (!user.email) continue;
          const subjectTranslations = DEVIATIONS.subjects.awaitingApproval(deviation.internalId, role);
          const subject = trilingualSubject(subjectTranslations);
          const messages = DEVIATIONS.messages.awaitingRole(deviation.internalId, role);
          const html = createEmailContent(messages, deviationUrl);
          try {
            await axios.post(`${process.env.API_URL}/mailer`, {
              to: user.email,
              subject,
              html,
            });

            // Log the notification
            notificationLogs.push({
              to: user.email,
              sentAt: new Date(),
              type: `reminder-${role}`,
            });

            remindersSent++;
          } catch (e) {
            console.error(`Error sending reminder mail to ${user.email}:`, e.message);
            emailErrors++;
          }
        }
      } else {
        const usersWithRole = await usersColl.find({ roles: role }).toArray();

        if (usersWithRole.length === 0) {
          // vacancy, notify plant manager
          const managers = await usersColl
            .find({ roles: 'plant-manager' })
            .toArray();
          for (const pm of managers) {
            if (!pm.email) continue;
            const subjectTranslations = DEVIATIONS.subjects.vacancy(deviation.internalId, role);
            const subject = trilingualSubject(subjectTranslations);
            const messages = DEVIATIONS.messages.vacancy(deviation.internalId, role);
            const html = createEmailContent(messages, deviationUrl);
            try {
              await axios.post(`${process.env.API_URL}/mailer`, {
                to: pm.email,
                subject,
                html,
              });

              // Log the notification
              notificationLogs.push({
                to: pm.email,
                sentAt: new Date(),
                type: `reminder-vacancy-${role}`,
              });

              remindersSent++;
            } catch (e) {
              console.error(`Error sending vacancy mail to ${pm.email}:`, e.message);
              emailErrors++;
            }
          }
          continue;
        }

        for (const user of usersWithRole) {
          if (!user.email) continue;
          const subjectTranslations = DEVIATIONS.subjects.awaitingApproval(deviation.internalId, role);
          const subject = trilingualSubject(subjectTranslations);
          const messages = DEVIATIONS.messages.awaitingRole(deviation.internalId, role);
          const html = createEmailContent(messages, deviationUrl);
          try {
            await axios.post(`${process.env.API_URL}/mailer`, {
              to: user.email,
              subject,
              html,
            });

            // Log the notification
            notificationLogs.push({
              to: user.email,
              sentAt: new Date(),
              type: `reminder-${role}`,
            });

            remindersSent++;
          } catch (e) {
            console.error(`Error sending reminder mail to ${user.email}:`, e.message);
            emailErrors++;
          }
        }
      }
    }

    // Update the deviation with notification logs if any were sent
    if (notificationLogs.length > 0) {
      try {
        await deviationsColl.updateOne(
          { _id: deviation._id },
          { $push: { notificationLogs: { $each: notificationLogs } } }
        );
      } catch (e) {
        console.error(
          `Error updating notification logs for deviation ${deviation._id}:`,
          e
        );
      }
    }
  }

  console.log(
    `sendDeviationApprovalReminders -> success at ${now.toLocaleString()} | Processed: ${
      pendingDeviations.length
    }, Reminders: ${remindersSent}, Errors: ${emailErrors}`
  );
}

export {
  sendDeviationApprovalReminders,
  sendDeviationApprovalReminders as sendPendingDeviationApprovalNotifications,
};

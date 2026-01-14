import axios from 'axios';
import dotenv from 'dotenv';
import { dbc } from '../lib/mongo.js';

dotenv.config();

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildHtml(content, buttonUrl, buttonText) {
  const buttonStyle =
    'display:inline-block;padding:10px 20px;font-size:16px;color:white;background-color:#007bff;text-decoration:none;border-radius:5px;';
  const button = buttonUrl
    ? `<p><a href="${buttonUrl}" style="${buttonStyle}">${buttonText}</a></p>`
    : '';
  return `<div style="font-family:Arial,sans-serif;max-width:600px;">${content}${button}</div>`;
}

const ROLE_NAMES = {
  'group-leader': { pl: 'Group Leader', en: 'Group Leader' },
  'quality-manager': { pl: 'Kierownik Jakości', en: 'Quality Manager' },
  'production-manager': { pl: 'Kierownik Produkcji', en: 'Production Manager' },
  'plant-manager': { pl: 'Dyrektor Zakładu', en: 'Plant Manager' },
};

async function sendDeviationApprovalReminders() {
  const deviationsColl = await dbc('deviations');
  const usersColl = await dbc('users');

  const now = new Date();
  const threshold = new Date(now.getTime() - 72 * 60 * 60 * 1000);

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
    const notificationLogs = [];
    const deviationUrl = `${process.env.APP_URL}/deviations/${deviation._id}`;
    const safeId = escapeHtml(deviation.internalId);

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

    // Plant manager final approval (English)
    if (plantManagerShouldBeNotified) {
      const plantManagers = await usersColl.find({ roles: 'plant-manager' }).toArray();

      for (const pm of plantManagers) {
        if (!pm.email) continue;

        const subject = `Deviation [${safeId}] - awaiting approval (Plant Manager)`;
        const message = `Deviation [${safeId}] has been approved by all other positions and has been awaiting Plant Manager approval for over 72h.`;
        const html = buildHtml(`<p>${message}</p>`, deviationUrl, 'Go to deviation');

        try {
          await axios.post(`${process.env.API_URL}/mailer`, { to: pm.email, subject, html });
          notificationLogs.push({ to: pm.email, sentAt: new Date(), type: 'reminder-plant-manager' });
          remindersSent++;
        } catch (e) {
          console.error(`Error sending plant manager reminder to ${pm.email}:`, e.message);
          emailErrors++;
        }
      }
    }

    for (const [role, approval] of Object.entries(approvalMap)) {
      if (approval?.approved !== undefined) continue;

      const isGroupLeader = role === 'group-leader';
      const roleName = ROLE_NAMES[role] || { pl: role, en: role };

      if (isGroupLeader) {
        const targetRole = `group-leader-${deviation.area}`;
        const groupLeaders = await usersColl
          .find({ roles: { $all: ['group-leader', targetRole] } })
          .toArray();

        if (groupLeaders.length === 0) {
          // Vacancy - notify plant manager (English)
          const managers = await usersColl.find({ roles: 'plant-manager' }).toArray();
          for (const pm of managers) {
            if (!pm.email) continue;
            const subject = `Deviation [${safeId}] - awaiting approval (vacancy ${roleName.en})`;
            const message = `Deviation [${safeId}] has been awaiting approval for over 72h. Notification sent to Plant Manager due to vacancy in position: ${roleName.en}.`;
            const html = buildHtml(`<p>${message}</p>`, deviationUrl, 'Go to deviation');
            try {
              await axios.post(`${process.env.API_URL}/mailer`, { to: pm.email, subject, html });
              notificationLogs.push({ to: pm.email, sentAt: new Date(), type: `reminder-vacancy-${role}` });
              remindersSent++;
            } catch (e) {
              console.error(`Error sending vacancy mail to ${pm.email}:`, e.message);
              emailErrors++;
            }
          }
          continue;
        }

        // Group leaders (Polish)
        for (const user of groupLeaders) {
          if (!user.email) continue;
          const subject = `Odchylenie [${safeId}] - oczekuje na zatwierdzenie (${roleName.pl})`;
          const message = `Odchylenie [${safeId}] oczekuje ponad 72h na zatwierdzenie w roli: ${roleName.pl}.`;
          const html = buildHtml(`<p>${message}</p>`, deviationUrl, 'Przejdź do odchylenia');
          try {
            await axios.post(`${process.env.API_URL}/mailer`, { to: user.email, subject, html });
            notificationLogs.push({ to: user.email, sentAt: new Date(), type: `reminder-${role}` });
            remindersSent++;
          } catch (e) {
            console.error(`Error sending reminder mail to ${user.email}:`, e.message);
            emailErrors++;
          }
        }
      } else {
        // Managers (English)
        const usersWithRole = await usersColl.find({ roles: role }).toArray();

        if (usersWithRole.length === 0) {
          // Vacancy - notify plant manager
          const managers = await usersColl.find({ roles: 'plant-manager' }).toArray();
          for (const pm of managers) {
            if (!pm.email) continue;
            const subject = `Deviation [${safeId}] - awaiting approval (vacancy ${roleName.en})`;
            const message = `Deviation [${safeId}] has been awaiting approval for over 72h. Notification sent to Plant Manager due to vacancy in position: ${roleName.en}.`;
            const html = buildHtml(`<p>${message}</p>`, deviationUrl, 'Go to deviation');
            try {
              await axios.post(`${process.env.API_URL}/mailer`, { to: pm.email, subject, html });
              notificationLogs.push({ to: pm.email, sentAt: new Date(), type: `reminder-vacancy-${role}` });
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
          const subject = `Deviation [${safeId}] - awaiting approval (${roleName.en})`;
          const message = `Deviation [${safeId}] has been awaiting approval for over 72h in role: ${roleName.en}.`;
          const html = buildHtml(`<p>${message}</p>`, deviationUrl, 'Go to deviation');
          try {
            await axios.post(`${process.env.API_URL}/mailer`, { to: user.email, subject, html });
            notificationLogs.push({ to: user.email, sentAt: new Date(), type: `reminder-${role}` });
            remindersSent++;
          } catch (e) {
            console.error(`Error sending reminder mail to ${user.email}:`, e.message);
            emailErrors++;
          }
        }
      }
    }

    if (notificationLogs.length > 0) {
      try {
        await deviationsColl.updateOne(
          { _id: deviation._id },
          { $push: { notificationLogs: { $each: notificationLogs } } }
        );
      } catch (e) {
        console.error(`Error updating notification logs for deviation ${deviation._id}:`, e);
      }
    }
  }

  console.log(
    `sendDeviationApprovalReminders -> success at ${now.toLocaleString()} | Processed: ${pendingDeviations.length}, Reminders: ${remindersSent}, Errors: ${emailErrors}`
  );
}

export {
  sendDeviationApprovalReminders,
  sendDeviationApprovalReminders as sendPendingDeviationApprovalNotifications,
};

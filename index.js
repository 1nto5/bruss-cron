import dotenv from 'dotenv';
import cron from 'node-cron';
import { archiveScans } from './archive-scans.js';
import { sendDeviationApprovalReminders } from './deviations/send-reminders.js';
import { deviationsStatusUpdate } from './deviations/status-update.js';
import { sendHrTrainingEvaluationNotifications } from './hr-training/evaluation-notifications.js';
import { errorCollector } from './lib/error-collector.js';
import { executeJobWithStatusTracking } from './lib/error-notifier.js';
import { statusCollector } from './lib/status-collector.js';
import { temperatureOutlierCollector } from './lib/temperature-outlier-collector.js';
import { temperatureMissingSensorCollector } from './lib/temperature-missing-sensor-collector.js';
import { logOvenTemperature } from './log-oven-temperature.js';
import { monitorEOL308Backup } from './monitors/eol308-backup.js';
import { monitorLv1Backup } from './monitors/lv1-backup.js';
import { monitorLv2Backup } from './monitors/lv2-backup.js';
import { monitorPm2ErrorLogs } from './monitors/pm2-error-logs.js';
import { monitorSqlLv1Backup } from './monitors/sql-lv1-backup.js';
import { monitorSqlLv2Backup } from './monitors/sql-lv2-backup.js';
import {
  sendProductionOvertimeApprovalReminders,
  sendProductionOvertimeAttendanceReminders,
} from './production-overtime/send-reminders.js';
import {
  sendOvertimeOrdersApprovalReminders,
  sendOvertimeOrdersAttendanceReminders,
} from './overtime-orders/send-reminders.js';
import { sendOvertimeSubmissionBalanceReminders } from './overtime-submissions/send-balance-reminders.js';
import { sendOvertimeSubmissionMonthEndReport } from './overtime-submissions/send-month-end-report.js';
import { sendOvertimeSubmissionsApprovalReminders } from './overtime-submissions/send-approval-reminders.js';
import { syncLdapUsers } from './sync/ldap-users.js';
import { syncR2platnikEmployees } from './sync/r2platnik-employees.js';
import { generateDmcheckCsv } from './powerbi/generate-dmcheck-csv.js';

dotenv.config();

// Validate required environment variables at startup
function validateEnv() {
  const required = ['MONGO_URI', 'API_URL', 'ADMIN_EMAIL', 'APP_URL'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }

  // Warn about optional but important vars
  const optional = {
    LDAP: 'LDAP sync disabled',
    R2PLATNIK_SQL_SERVER: 'R2platnik sync disabled',
    SYNOLOGY_IP: 'Backup monitoring disabled',
    CONTROLLINO_API_KEY: 'Temperature monitoring disabled',
  };

  Object.entries(optional).forEach(([key, msg]) => {
    if (!process.env[key]) {
      console.warn(`[env] ${key} not set - ${msg}`);
    }
  });

  console.log('Environment validation passed');
}

validateEnv();

// Run missed backup monitors on startup (handles restart between 07:12-08:00)
async function runMissedBackupMonitors() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const currentMinutes = hours * 60 + minutes;

  // Backup monitors run 07:00-07:12, summary at 08:00
  // If starting after 07:12 (432 min) but before 08:00 (480 min), run monitors
  if (currentMinutes >= 432 && currentMinutes < 480) {
    console.log('[startup] Running backup monitors (missed due to restart)');
    try {
      await executeJobWithStatusTracking('monitorLv1Backup', monitorLv1Backup);
      await executeJobWithStatusTracking('monitorLv2Backup', monitorLv2Backup);
      await executeJobWithStatusTracking('monitorSqlLv1Backup', monitorSqlLv1Backup);
      await executeJobWithStatusTracking('monitorSqlLv2Backup', monitorSqlLv2Backup);
      await executeJobWithStatusTracking('monitorEOL308Backup', monitorEOL308Backup);
      console.log('[startup] Backup monitors completed');
    } catch (error) {
      console.error('[startup] Backup monitor error:', error.message);
    }
  }
}

runMissedBackupMonitors();

// Deviations tasks
// -----------------------
// Schedule sending of pending deviation approval notifications every workday at 03:00
cron.schedule(
  '0 3 * * 1-5',
  async () => {
    await executeJobWithStatusTracking(
      'sendDeviationApprovalReminders',
      sendDeviationApprovalReminders
    );
  },
  {}
);
// Schedule deviations status update every 2 hours
cron.schedule(
  '0 */2 * * *',
  async () => {
    await executeJobWithStatusTracking(
      'deviationsStatusUpdate',
      deviationsStatusUpdate
    );
  },
  {}
);

// Production overtime tasks (collection: production_overtime)
// -----------------------------------------------------------
// Schedule sending of pending production overtime email notifications every workday at 3:05
cron.schedule('5 3 * * 1-5', async () => {
  await executeJobWithStatusTracking(
    'sendProductionOvertimeApprovalReminders',
    sendProductionOvertimeApprovalReminders
  );
});
// Schedule sending of completed task attendance reminders every workday at 9:00
cron.schedule('0 9 * * 1-5', async () => {
  await executeJobWithStatusTracking(
    'sendProductionOvertimeAttendanceReminders',
    sendProductionOvertimeAttendanceReminders
  );
});

// Overtime orders tasks (collection: overtime_orders)
// ---------------------------------------------------
// Schedule sending of pending overtime orders email notifications every workday at 3:15
cron.schedule('15 3 * * 1-5', async () => {
  await executeJobWithStatusTracking(
    'sendOvertimeOrdersApprovalReminders',
    sendOvertimeOrdersApprovalReminders
  );
});
// Schedule sending of completed overtime orders attendance reminders every workday at 9:05
cron.schedule('5 9 * * 1-5', async () => {
  await executeJobWithStatusTracking(
    'sendOvertimeOrdersAttendanceReminders',
    sendOvertimeOrdersAttendanceReminders
  );
});

// Overtime submissions tasks (collection: overtime_submissions)
// -------------------------------------------------------------
// Schedule sending of approval reminders to supervisors and plant managers every workday at 3:25
cron.schedule('25 3 * * 1-5', async () => {
  await executeJobWithStatusTracking(
    'sendOvertimeSubmissionsApprovalReminders',
    sendOvertimeSubmissionsApprovalReminders
  );
});
// Schedule sending of balance reminders to users (7 days before month end) every workday at 3:20
cron.schedule('20 3 * * 1-5', async () => {
  await executeJobWithStatusTracking(
    'sendOvertimeSubmissionBalanceReminders',
    sendOvertimeSubmissionBalanceReminders
  );
});

// Schedule sending of month-end report to plant managers (last day of month) at 4:00
cron.schedule('0 4 28-31 * *', async () => {
  await executeJobWithStatusTracking(
    'sendOvertimeSubmissionMonthEndReport',
    sendOvertimeSubmissionMonthEndReport
  );
});

// HR Training Evaluation Notifications
// ------------------------------------
// Schedule HR training evaluation deadline notifications every workday at 3:10
cron.schedule('10 3 * * 1-5', async () => {
  await executeJobWithStatusTracking(
    'sendHrTrainingEvaluationNotifications',
    sendHrTrainingEvaluationNotifications
  );
});

// Data synchronization tasks
// --------------------------
// Schedule synchronization of r2platnik employees at 16:00 every workday
cron.schedule('0 16 * * 1-5', async () => {
  await executeJobWithStatusTracking(
    'syncR2platnikEmployees',
    syncR2platnikEmployees
  );
});
// Schedule synchronization of LDAP users every workday at 16:10
cron.schedule('10 16 * * 1-5', async () => {
  await executeJobWithStatusTracking('syncLdapUsers', syncLdapUsers);
});

// PM2 Error Log Monitoring
// ------------------------
// Monitor PM2 error logs every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  await executeJobWithStatusTracking('monitorPm2ErrorLogs', monitorPm2ErrorLogs);
});

// Backup Monitoring tasks
// -----------------------
// Monitor LV1 MVC_Pictures backup daily at 07:00 (before daily summary at 08:00)
cron.schedule('0 7 * * *', async () => {
  await executeJobWithStatusTracking('monitorLv1Backup', monitorLv1Backup);
});

// Monitor LV2 Zasoby backup daily at 07:03
cron.schedule('3 7 * * *', async () => {
  await executeJobWithStatusTracking('monitorLv2Backup', monitorLv2Backup);
});

// Monitor LV1 SQL backup daily at 07:06
cron.schedule('6 7 * * *', async () => {
  await executeJobWithStatusTracking('monitorSqlLv1Backup', monitorSqlLv1Backup);
});

// Monitor LV2 SQL backup daily at 07:09
cron.schedule('9 7 * * *', async () => {
  await executeJobWithStatusTracking('monitorSqlLv2Backup', monitorSqlLv2Backup);
});

// Monitor EOL308 backup daily at 07:12
cron.schedule('12 7 * * *', async () => {
  await executeJobWithStatusTracking(
    'monitorEOL308Backup',
    monitorEOL308Backup
  );
});

// Maintenance tasks
// ----------------
// Schedule archiving of scans every Sunday at 22:00
cron.schedule('0 22 * * 0', async () => {
  await executeJobWithStatusTracking('archiveScans', archiveScans);
});

// Schedule logging of oven sensors every 1 minute
cron.schedule('* * * * *', async () => {
  await executeJobWithStatusTracking('logOvenTemperature', logOvenTemperature);
});

// Error reporting tasks
// ---------------------
// Schedule batch error notification every hour at minute 0
cron.schedule('0 * * * *', async () => {
  await errorCollector.sendBatchNotification();
});

// Schedule batch temperature outlier notification daily at 9:00 AM
cron.schedule('0 9 * * *', async () => {
  await temperatureOutlierCollector.sendBatchNotification();
});

// Schedule batch missing sensor notification every hour at minute 0
cron.schedule('0 * * * *', async () => {
  await temperatureMissingSensorCollector.sendBatchNotification();
});

// Status reporting tasks
// ----------------------
// Schedule daily status summary at 8:00 AM every day
// Includes all executions since the last summary was sent
cron.schedule('0 8 * * *', async () => {
  await statusCollector.sendStatusSummary();
});

// Power BI data generation
// ------------------------
// Generate dmcheck CSV at 5:50 AM and 1:50 PM (10 min before Power BI refresh at 6 AM / 2 PM)
cron.schedule('50 5,13 * * *', async () => {
  await executeJobWithStatusTracking('generateDmcheckCsv', generateDmcheckCsv);
});

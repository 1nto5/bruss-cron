import dotenv from 'dotenv';
dotenv.config();

import cron from 'node-cron';
import client from './lib/mongo.js';
import { isFeatureEnabled, plant } from './lib/plant.js';
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
  sendOvertimeOrdersApprovalReminders,
  sendOvertimeOrdersAttendanceReminders,
} from './overtime-orders/send-reminders.js';
import { sendIndividualOvertimeOrdersApprovalReminders } from './individual-overtime-orders/send-approval-reminders.js';
import { sendOvertimeSubmissionBalanceReminders } from './overtime-submissions/send-balance-reminders.js';
import { sendOvertimeSubmissionMonthEndReport } from './overtime-submissions/send-month-end-report.js';
import { sendOvertimeSubmissionsApprovalReminders } from './overtime-submissions/send-approval-reminders.js';
import { sendSupervisorMonthEndReport } from './overtime-submissions/send-supervisor-month-end-report.js';
import { syncLdapUsers } from './sync/ldap-users.js';
import { syncR2platnikEmployees } from './sync/r2platnik-employees.js';
import { syncR2platnikEmployeeOptions } from './sync/r2platnik-employee-options.js';
import { generateDmcheckDefectsCsv } from './powerbi/generate-dmcheck-defects-csv.js';
import { syncCMMSFirebirdToPostgres } from './sync/firebird-to-postgres.js';
import { closeAllPools } from './lib/postgres.js';

// Validate required environment variables at startup
function validateEnv() {
  const required = ['MONGO_URI'];
  if (isFeatureEnabled('email-notifications')) {
    required.push('API_URL', 'ADMIN_EMAIL', 'APP_URL');
  }
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

// Log plant configuration
const features = ['dmcheck', 'dmcheck-archive', 'oven', 'deviations', 'overtime', 'hr-training', 'sync', 'ldap-sync', 'backup-monitors', 'email-notifications', 'cmms-sync'];
console.log(`[plant] Plant: ${plant}`);
features.forEach((f) => {
  console.log(`[plant]   ${f}: ${isFeatureEnabled(f) ? 'enabled' : 'disabled'}`);
});

// Run missed backup monitors on startup (handles restart between 07:12-08:00)
async function runMissedBackupMonitors() {
  if (!isFeatureEnabled('backup-monitors')) return;

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

// Job registry — declarative schedule for all simple executeJobWithStatusTracking jobs
const jobRegistry = [
  // Deviations
  { feature: 'deviations',          schedule: '0 3 * * 1-5',    name: 'sendDeviationApprovalReminders',              fn: sendDeviationApprovalReminders },
  { feature: 'deviations',          schedule: '0 */2 * * *',    name: 'deviationsStatusUpdate',                      fn: deviationsStatusUpdate },
  // Overtime orders
  { feature: 'overtime',            schedule: '15 3 * * 1-5',   name: 'sendOvertimeOrdersApprovalReminders',         fn: sendOvertimeOrdersApprovalReminders },
  { feature: 'overtime',            schedule: '5 9 * * 1-5',    name: 'sendOvertimeOrdersAttendanceReminders',       fn: sendOvertimeOrdersAttendanceReminders },
  { feature: 'overtime',            schedule: '30 3 * * 1-5',   name: 'sendIndividualOvertimeOrdersApprovalReminders', fn: sendIndividualOvertimeOrdersApprovalReminders },
  // Overtime submissions
  { feature: 'overtime',            schedule: '25 3 * * 1-5',   name: 'sendOvertimeSubmissionsApprovalReminders',    fn: sendOvertimeSubmissionsApprovalReminders },
  { feature: 'overtime',            schedule: '20 3 * * 1-5',   name: 'sendOvertimeSubmissionBalanceReminders',      fn: sendOvertimeSubmissionBalanceReminders },
  { feature: 'overtime',            schedule: '0 4 26-29 * *',  name: 'sendSupervisorMonthEndReport',                fn: sendSupervisorMonthEndReport },
  { feature: 'overtime',            schedule: '0 4 28-31 * *',  name: 'sendOvertimeSubmissionMonthEndReport',        fn: sendOvertimeSubmissionMonthEndReport },
  // HR training
  { feature: 'hr-training',         schedule: '10 3 * * 1-5',   name: 'sendHrTrainingEvaluationNotifications',       fn: sendHrTrainingEvaluationNotifications },
  // Sync
  { feature: 'sync',                schedule: '0 16 * * 1-5',   name: 'syncR2platnikEmployees',                      fn: syncR2platnikEmployees },
  { feature: 'sync',                schedule: '5 16 * * 1-5',   name: 'syncR2platnikEmployeeOptions',                fn: syncR2platnikEmployeeOptions },
  // Monitoring
  { feature: 'email-notifications', schedule: '*/15 * * * *',   name: 'monitorPm2ErrorLogs',                         fn: monitorPm2ErrorLogs },
  // Backup monitors
  { feature: 'backup-monitors',     schedule: '0 7 * * *',      name: 'monitorLv1Backup',                            fn: monitorLv1Backup },
  { feature: 'backup-monitors',     schedule: '3 7 * * *',      name: 'monitorLv2Backup',                            fn: monitorLv2Backup },
  { feature: 'backup-monitors',     schedule: '6 7 * * *',      name: 'monitorSqlLv1Backup',                         fn: monitorSqlLv1Backup },
  { feature: 'backup-monitors',     schedule: '9 7 * * *',      name: 'monitorSqlLv2Backup',                         fn: monitorSqlLv2Backup },
  { feature: 'backup-monitors',     schedule: '12 7 * * *',     name: 'monitorEOL308Backup',                         fn: monitorEOL308Backup },
  // DMCheck
  { feature: 'dmcheck',             schedule: '50 5,13 * * *',  name: 'generateDmcheckDefectsCsv',                   fn: generateDmcheckDefectsCsv },
  // Firebird → PostgreSQL sync
  { feature: 'cmms-sync',           schedule: '0 2 * * *',      name: 'syncCMMSFirebirdToPostgres',                  fn: syncCMMSFirebirdToPostgres },
  // Oven
  { feature: 'oven',                schedule: '* * * * *',       name: 'logOvenTemperature',                          fn: logOvenTemperature },
];

for (const job of jobRegistry) {
  if (isFeatureEnabled(job.feature)) {
    cron.schedule(job.schedule, () => executeJobWithStatusTracking(job.name, job.fn));
  }
}

// Jobs with compound feature gates or non-standard patterns (kept inline)

// LDAP sync — enabled by 'sync' (full) or 'ldap-sync' (LDAP only)
if (isFeatureEnabled('sync') || isFeatureEnabled('ldap-sync')) {
  cron.schedule('10 16 * * 1-5', () => executeJobWithStatusTracking('syncLdapUsers', syncLdapUsers));
}

// Archive scans — enabled by 'dmcheck' (full) or 'dmcheck-archive' (archive only)
if (isFeatureEnabled('dmcheck') || isFeatureEnabled('dmcheck-archive')) {
  cron.schedule('0 22 * * 0', () => executeJobWithStatusTracking('archiveScans', archiveScans));
}

// Collector batch notifications (method calls, not standalone functions)
if (isFeatureEnabled('oven')) {
  cron.schedule('0 9 * * *', () => temperatureOutlierCollector.sendBatchNotification());
  cron.schedule('0 * * * *', () => temperatureMissingSensorCollector.sendBatchNotification());
}

if (isFeatureEnabled('email-notifications')) {
  cron.schedule('0 * * * *', () => errorCollector.sendBatchNotification());
  cron.schedule('0 8 * * *', () => statusCollector.sendStatusSummary());
}

// Graceful shutdown
async function shutdown(signal) {
  console.log(`\n[shutdown] ${signal} received, stopping...`);
  const tasks = cron.getTasks();
  for (const [, task] of tasks) {
    task.stop();
  }
  console.log(`[shutdown] ${tasks.size} cron tasks stopped`);
  try {
    await client.close();
    console.log('[shutdown] MongoDB connection closed');
  } catch (err) {
    console.error('[shutdown] Error closing MongoDB:', err.message);
  }
  try {
    await closeAllPools();
    console.log('[shutdown] PostgreSQL pools closed');
  } catch (err) {
    console.error('[shutdown] Error closing PostgreSQL:', err.message);
  }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

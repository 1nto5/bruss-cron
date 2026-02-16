import { createBackupMonitor } from './create-backup-monitor.js';

export const monitorSqlLv2Backup = createBackupMonitor({
  envPathKey: 'SMB_SQL_LV2_MONITOR_PATH',
  statusFileName: 'last_sql_backup_status.json',
  backupName: 'LV2 SQL',
  errorPrefix: 'SQL backup',
  errorJoinChar: '; ',
  buildResultFields: (status) => ({
    backupFile: status.backupFile || 'unknown',
    backupSize: status.backupSize || '0',
    backupBytes: status.backupBytes || 0,
    remainingBackups: status.remainingBackups || 0,
    database: status.database || 'bmw_l2',
    host: status.host || 'unknown',
  }),
});

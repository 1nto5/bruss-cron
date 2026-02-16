import { createBackupMonitor } from './create-backup-monitor.js';

export const monitorLv1Backup = createBackupMonitor({
  envPathKey: 'SMB_LV1_MONITOR_PATH',
  statusFileName: 'last_backup_status.json',
  backupName: 'LV1',
  errorPrefix: 'Backup',
  errorJoinChar: '; ',
  buildResultFields: (status) => ({
    copiedFiles: status.copiedFiles || 0,
    skippedFiles: status.skippedFiles || 0,
    totalFiles: status.totalFiles || 0,
    formattedSize: status.totalSize || '0 B',
    totalBytes: 0,
  }),
});

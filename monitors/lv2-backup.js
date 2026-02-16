import { createBackupMonitor } from './create-backup-monitor.js';

export const monitorLv2Backup = createBackupMonitor({
  envPathKey: 'SMB_LV2_MONITOR_PATH',
  statusFileName: 'last_backup_status.json',
  backupName: 'LV2',
  errorPrefix: 'Backup',
  errorJoinChar: '; ',
  buildResultFields: (status) => ({
    copiedFiles: status.copiedFiles || 0,
    skippedFiles: status.skippedFiles || 0,
    totalFiles: status.totalFiles || 0,
    formattedSize: status.totalSize || '0 B',
    totalBytes: 0,
    successfulDirs: status.successfulDirs || 0,
    failedDirs: status.failedDirs || 0,
  }),
});

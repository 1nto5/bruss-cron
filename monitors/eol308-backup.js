import { createBackupMonitor } from './create-backup-monitor.js';

export const monitorEOL308Backup = createBackupMonitor({
  envPathKey: 'SMB_EOL308_MONITOR_PATH',
  statusFileName: 'last_backup_status.json',
  backupName: 'EOL308',
  errorPrefix: 'Backup',
  errorJoinChar: ', ',
  buildResultFields: (status) => ({
    copiedFiles: status.copiedFiles || 0,
    skippedFiles: status.skippedFiles || 0,
    totalFiles: status.totalFiles || 0,
    formattedSize: status.totalSize || 'N/A',
  }),
});

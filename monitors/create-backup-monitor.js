import { connectToSynologyWithFailover } from '../lib/smb-helpers.js';

/**
 * Factory that produces a backup monitor function from config.
 *
 * @param {object} config
 * @param {string} config.envPathKey       - env var name for the SMB monitor path (e.g. 'SMB_LV1_MONITOR_PATH')
 * @param {string} config.statusFileName   - JSON file to read (e.g. 'last_backup_status.json')
 * @param {string} config.backupName       - human label used in results and errors (e.g. 'LV1')
 * @param {string} config.errorPrefix      - prefix for failure/stale messages (e.g. 'Last backup' or 'Last SQL backup')
 * @param {string} config.errorJoinChar    - character(s) to join error array (e.g. '; ' or ', ')
 * @param {(status: object) => object} config.buildResultFields - returns extra result fields from the parsed status
 * @returns {() => Promise<object>}
 */
export function createBackupMonitor(config) {
  const {
    envPathKey,
    statusFileName,
    backupName,
    errorPrefix,
    errorJoinChar,
    buildResultFields,
  } = config;

  return async function monitor() {
    const startTime = Date.now();

    try {
      const synologyIp = process.env.SYNOLOGY_IP;
      const synologyUser = process.env.SYNOLOGY_BACKUP_USER;
      const synologyPass = process.env.SYNOLOGY_BACKUP_PASS;

      const monitorPath = process.env[envPathKey];
      const staleThresholdHours = parseInt(
        process.env.SMB_STALE_THRESHOLD_HOURS || '24'
      );

      if (!synologyIp || !synologyUser || !synologyPass) {
        throw new Error(
          'Missing Synology configuration in environment variables'
        );
      }
      if (!monitorPath) {
        throw new Error(
          `Missing ${backupName} monitoring configuration in environment variables`
        );
      }

      const [monitorShare, ...pathParts] = monitorPath.split('/');
      const monitorSubPath = pathParts.join('/');

      const { client: smbClient, connectedIp } =
        await connectToSynologyWithFailover(
          [synologyIp],
          monitorShare,
          synologyUser,
          synologyPass,
          undefined
        );

      const statusFilePath = `${monitorSubPath}\\${statusFileName}`;

      const statusJson = await new Promise((resolve, reject) => {
        smbClient.readFile(statusFilePath, (err, content) => {
          if (err) {
            reject(new Error(`Failed to read status file: ${err.message}`));
            return;
          }

          try {
            const contentStr = content.toString('utf8').trim();
            if (!contentStr) {
              reject(new Error('Status file is empty'));
              return;
            }
            resolve(JSON.parse(contentStr));
          } catch (parseErr) {
            const contentPreview = content
              .toString('utf8')
              .trim()
              .substring(0, 200);
            reject(
              new Error(
                `Failed to parse status JSON: ${parseErr.message}. Content preview: ${contentPreview}`
              )
            );
          }
        });
      });

      const lastBackupTime = new Date(
        statusJson.timestampIso || statusJson.timestamp
      );
      const nowTime = new Date();
      const hoursSinceBackup = (nowTime - lastBackupTime) / (1000 * 60 * 60);

      if (hoursSinceBackup > staleThresholdHours) {
        throw new Error(
          `${errorPrefix} is stale! Last backup was ${hoursSinceBackup.toFixed(1)} hours ago ` +
            `(threshold: ${staleThresholdHours} hours). Last backup: ${statusJson.timestamp}`
        );
      }

      if (statusJson.exitCode !== 0) {
        const errorMsg =
          statusJson.errors && statusJson.errors.length > 0
            ? statusJson.errors.join(errorJoinChar)
            : 'Unknown error';
        throw new Error(
          `${errorPrefix} failed with exit code ${statusJson.exitCode}: ${errorMsg}`
        );
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      return {
        backupName,
        lastBackupTime: statusJson.timestamp,
        lastBackupExitCode: statusJson.exitCode,
        lastBackupDuration: statusJson.duration,
        hoursSinceBackup: hoursSinceBackup.toFixed(1),
        monitorDuration: `${duration}s`,
        synologyIp: connectedIp,
        ...buildResultFields(statusJson),
      };
    } catch (error) {
      console.error(`Error in ${backupName} backup monitor:`, error);
      throw error;
    }
  };
}

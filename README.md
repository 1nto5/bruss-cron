# BRUSS-CRON

Scheduled task automation and monitoring service for BRUSS manufacturing operations. Provides automated reminders, data synchronization, monitoring, and backup services for the bruss-intra and bruss-floor applications.

## Installation

```bash
bun install
```

## Running

### With PM2 (Production - Windows Server)

```bash
pm2 start ecosystem.config.cjs
pm2 save
```

### Manual Start

**Important:** Must use `--openssl-legacy-provider` flag for SMB backup functionality.

```bash
node --openssl-legacy-provider index.js
```

## Configuration

Copy `.env.example` to `.env` and configure environment variables.

## Features

- Deviation reminders and status updates
- Production overtime tracking
- Task attendance reminders
- LDAP and R2platnik employee synchronization
- Oven temperature monitoring
- Scan archiving
- **SMB backups:** LV1 MVC_Pictures and LV2 Zasoby to Synology NAS

## Cron Schedule Reference

| Job | Schedule | Description |
|-----|----------|-------------|
| `sendDeviationApprovalReminders` | `0 3 * * 1-5` | Mon-Fri 03:00 - Pending deviation reminders |
| `deviationsStatusUpdate` | `0 */2 * * *` | Every 2h - Update deviation statuses |
| `sendOvertimeApprovalReminders` | `5 3 * * 1-5` | Mon-Fri 03:05 - Overtime approval reminders |
| `sendCompletedTaskAttendanceReminders` | `0 9 * * 1-5` | Mon-Fri 09:00 - Attendance list reminders |
| `sendHrTrainingEvaluationNotifications` | `10 3 * * 1-5` | Mon-Fri 03:10 - Training evaluation reminders |
| `syncR2platnikEmployees` | `0 16 * * 1-5` | Mon-Fri 16:00 - Sync employees from R2platnik |
| `syncLdapUsers` | `10 16 * * 1-5` | Mon-Fri 16:10 - Sync users from LDAP |
| `monitorPm2ErrorLogs` | `*/15 * * * *` | Every 15min - Check PM2 error logs |
| `monitorLv1Backup` | `0 7 * * *` | Daily 07:00 - Check LV1 backup status |
| `monitorLv2Backup` | `3 7 * * *` | Daily 07:03 - Check LV2 backup status |
| `monitorSqlLv1Backup` | `6 7 * * *` | Daily 07:06 - Check SQL LV1 backup status |
| `monitorSqlLv2Backup` | `9 7 * * *` | Daily 07:09 - Check SQL LV2 backup status |
| `monitorEOL308Backup` | `12 7 * * *` | Daily 07:12 - Check EOL308 backup status |
| `archiveScans` | `0 22 * * 0` | Sunday 22:00 - Archive old scans |
| `logOvenTemperature` | `* * * * *` | Every minute - Log oven temperatures |
| `errorCollector.sendBatchNotification` | `0 * * * *` | Hourly - Send batched error notifications |
| `temperatureOutlierCollector.sendBatchNotification` | `0 9 * * *` | Daily 09:00 - Temperature outlier report |
| `temperatureMissingSensorCollector.sendBatchNotification` | `0 * * * *` | Hourly - Missing sensor alerts |
| `statusCollector.sendStatusSummary` | `0 8 * * *` | Daily 08:00 - Daily status summary email |

## Related Projects

- **bruss-intra** - Management and analytics web application
- **bruss-floor** - Shop floor operations web application

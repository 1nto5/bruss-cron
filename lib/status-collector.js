import axios from 'axios';
import { parseEmailAddresses } from './email-helper.js';
import { STYLES, tableCell, tableStart, tableEnd, box, container } from './email-html.js';
import { hoursAgo, toWarsawTime } from './format-helpers.js';

class StatusCollector {
  constructor() {
    this.jobExecutions = [];
    this.maxExecutions = 2000; // Keep more history for status reporting
    this.lastSummarySentAt = null; // Track when last summary was sent (for time-based filtering)
  }

  /**
   * Add successful job execution to collection
   * @param {string} jobName - Name of the cron job that succeeded
   * @param {Object} result - Optional result data from the job
   */
  addSuccess(jobName, result = {}) {
    const execution = {
      jobName,
      status: 'success',
      result,
      timestamp: new Date().toISOString(),
      timestampFormatted: toWarsawTime(),
      isBackup: result.backupName ? true : false, // Mark backup jobs
    };

    this.jobExecutions.push(execution);

    // Prevent memory overflow
    if (this.jobExecutions.length > this.maxExecutions) {
      this.jobExecutions.shift(); // Remove oldest execution
    }
  }

  /**
   * Add failed job execution to collection
   * @param {string} jobName - Name of the cron job that failed
   * @param {Error} error - The error object
   * @param {Object} context - Additional context about the error
   */
  addFailure(jobName, error, context = {}) {
    const execution = {
      jobName,
      status: 'failure',
      error: {
        message: error.message || 'Unknown error',
        stack: error.stack,
      },
      context,
      timestamp: new Date().toISOString(),
      timestampFormatted: toWarsawTime(),
      isBackup: jobName.includes('Backup') || context.backupName ? true : false, // Mark backup jobs
    };

    this.jobExecutions.push(execution);

    // Prevent memory overflow
    if (this.jobExecutions.length > this.maxExecutions) {
      this.jobExecutions.shift(); // Remove oldest execution
    }
  }

  /**
   * Get executions from the last specified hours
   * @param {number} hours - Number of hours to look back
   */
  getRecentExecutions(hours = 24) {
    const cutoff = hoursAgo(hours);
    return this.jobExecutions.filter(exec => new Date(exec.timestamp) > cutoff);
  }

  /**
   * Get executions since the specified timestamp
   * @param {string|null} timestamp - ISO timestamp to filter from (null returns all)
   * @returns {Array} Filtered executions
   */
  getExecutionsSince(timestamp) {
    if (!timestamp) {
      // First run - return all executions
      return [...this.jobExecutions];
    }

    const cutoffDate = new Date(timestamp);
    
    // Handle edge case: if timestamp is older than oldest execution, return all available
    if (this.jobExecutions.length > 0) {
      const oldestExecution = this.jobExecutions[0];
      if (cutoffDate < new Date(oldestExecution.timestamp)) {
        return [...this.jobExecutions];
      }
    }

    return this.jobExecutions.filter(exec => new Date(exec.timestamp) > cutoffDate);
  }

  /**
   * Format period duration in human-readable format
   * @param {number} milliseconds - Duration in milliseconds
   * @returns {string} Formatted duration
   */
  formatPeriodDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      const remainingHours = hours % 24;
      return remainingHours > 0 ? `${days} day${days > 1 ? 's' : ''} ${remainingHours} hour${remainingHours > 1 ? 's' : ''}` : `${days} day${days > 1 ? 's' : ''}`;
    } else if (hours > 0) {
      const remainingMinutes = minutes % 60;
      return remainingMinutes > 0 ? `${hours} hour${hours > 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}` : `${hours} hour${hours > 1 ? 's' : ''}`;
    } else if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    } else {
      return `${seconds} second${seconds > 1 ? 's' : ''}`;
    }
  }

  /**
   * Generate summary statistics for executions
   * @param {Array} executions - Array of execution objects to analyze
   */
  generateSummary(executions) {
    const jobStats = {};

    // Calculate period info
    let periodStart = null;
    let periodEnd = null;

    if (executions.length > 0) {
      const timestamps = executions.map(e => new Date(e.timestamp));
      periodStart = new Date(Math.min(...timestamps));
      periodEnd = new Date(Math.max(...timestamps));
    }

    // Group executions by job name
    executions.forEach(exec => {
      if (!jobStats[exec.jobName]) {
        jobStats[exec.jobName] = {
          jobName: exec.jobName,
          totalExecutions: 0,
          successCount: 0,
          failureCount: 0,
          lastExecution: null,
          lastSuccess: null,
          lastFailure: null,
        };
      }

      const stats = jobStats[exec.jobName];
      stats.totalExecutions++;

      if (exec.status === 'success') {
        stats.successCount++;
        if (!stats.lastSuccess || new Date(exec.timestamp) > new Date(stats.lastSuccess)) {
          stats.lastSuccess = exec.timestampFormatted;
        }
      } else {
        stats.failureCount++;
        if (!stats.lastFailure || new Date(exec.timestamp) > new Date(stats.lastFailure)) {
          stats.lastFailure = exec.timestampFormatted;
        }
      }

      if (!stats.lastExecution || new Date(exec.timestamp) > new Date(stats.lastExecution)) {
        stats.lastExecution = exec.timestampFormatted;
      }
    });

    const generatedAt = toWarsawTime();

    const periodDuration = periodStart && periodEnd ? this.formatPeriodDuration(periodEnd - periodStart) : null;
    const periodStartFormatted = periodStart ? toWarsawTime(periodStart) : null;

    return {
      periodStart: periodStart ? periodStart.toISOString() : null,
      periodEnd: periodEnd ? periodEnd.toISOString() : null,
      periodStartFormatted,
      periodDuration,
      totalExecutions: executions.length,
      successfulExecutions: executions.filter(e => e.status === 'success').length,
      failedExecutions: executions.filter(e => e.status === 'failure').length,
      uniqueJobs: Object.keys(jobStats).length,
      jobStats: Object.values(jobStats),
      generatedAt,
    };
  }

  /**
   * Send regular status summary email
   * Includes all executions since the last summary was sent
   */
  async sendStatusSummary() {
    // Get executions since last summary was sent
    const filteredExecutions = this.getExecutionsSince(this.lastSummarySentAt);
    
    // Separate backup and non-backup executions
    const backupExecutions = filteredExecutions.filter(exec => exec.isBackup);
    const nonBackupExecutions = filteredExecutions.filter(exec => !exec.isBackup);

    // Generate summary for non-backup executions (jobs)
    const summary = this.generateSummary(nonBackupExecutions);

    // Calculate backup counts
    const backupSuccessCount = backupExecutions.filter(e => e.status === 'success').length;
    const backupFailureCount = backupExecutions.filter(e => e.status === 'failure').length;
    const totalFailures = summary.failedExecutions + backupFailureCount;

    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      console.error('ADMIN_EMAIL is not configured in environment variables');
      return;
    }

    // Build subject line with status prefix
    let statusPrefix = 'OK';
    if (totalFailures > 0) {
      const parts = [];
      if (backupFailureCount > 0) parts.push(`${backupFailureCount} backup`);
      if (summary.failedExecutions > 0) parts.push(`${summary.failedExecutions} job`);
      statusPrefix = `ERRORS (${parts.join(', ')})`;
    }

    let subject = `[CRON] ${statusPrefix} - Status Summary`;
    if (summary.periodStartFormatted) {
      subject += ` (since ${summary.periodStartFormatted})`;
    }
    subject += ` - ${summary.generatedAt}`;

    // Calculate overall health score (including backups)
    const totalExecutions = summary.totalExecutions + backupExecutions.length;
    const totalSuccesses = summary.successfulExecutions + backupSuccessCount;
    const healthScore = totalExecutions > 0
      ? ((totalSuccesses / totalExecutions) * 100).toFixed(1)
      : 100;

    const statusColor = totalFailures === 0 ? '#4caf50' :
                       healthScore >= 90 ? '#ff9800' : '#f44336';

    // Build period description
    let periodDescription = 'All executions since system start';
    if (summary.periodStartFormatted) {
      if (summary.periodDuration) {
        periodDescription = `Since ${summary.periodStartFormatted} (${summary.periodDuration}) until ${summary.generatedAt}`;
      } else {
        periodDescription = `Since ${summary.periodStartFormatted} until ${summary.generatedAt}`;
      }
    } else {
      periodDescription = `All executions until ${summary.generatedAt}`;
    }

    const failedJobsColor = summary.failedExecutions > 0 ? '#f44336' : '#4caf50';
    const failedBackupsColor = backupFailureCount > 0 ? '#f44336' : '#4caf50';

    let body = `<h2 style="color: ${statusColor};">Status Summary - Since Last Report</h2>`;

    body += box(
      `<p><strong>Jobs:</strong> <span style="color: #4caf50;">${summary.successfulExecutions} successful</span> | <span style="color: ${failedJobsColor};">${summary.failedExecutions} failed</span></p>` +
      `<p><strong>Backups:</strong> <span style="color: #4caf50;">${backupSuccessCount} successful</span> | <span style="color: ${failedBackupsColor};">${backupFailureCount} failed</span></p>`,
      'info'
    );

    // Add "Requires Attention" section if there are any failures
    if (totalFailures > 0) {
      let attentionContent = '<h3 style="color: #f44336; margin-top: 0;">Requires Attention</h3>';

      // List failed backups
      const failedBackups = backupExecutions.filter(e => e.status === 'failure');
      if (failedBackups.length > 0) {
        attentionContent += '<p><strong>Failed Backups:</strong></p><ul>';
        failedBackups.forEach(backup => {
          const name = (backup.result?.backupName || backup.jobName.replace('monitor', '').replace('Backup', '')).toUpperCase();
          const errorMsg = backup.error?.message || backup.context?.error || 'Unknown error';
          attentionContent += `<li><strong>${name}</strong>: ${errorMsg}</li>`;
        });
        attentionContent += '</ul>';
      }

      // List failed jobs
      const failedJobExecutions = nonBackupExecutions.filter(e => e.status === 'failure');
      if (failedJobExecutions.length > 0) {
        attentionContent += '<p><strong>Failed Jobs:</strong></p><ul>';
        const failedJobsMap = {};
        failedJobExecutions.forEach(exec => {
          if (!failedJobsMap[exec.jobName]) {
            failedJobsMap[exec.jobName] = { count: 0, lastError: exec.error?.message || 'Unknown error' };
          }
          failedJobsMap[exec.jobName].count++;
          failedJobsMap[exec.jobName].lastError = exec.error?.message || 'Unknown error';
        });
        Object.entries(failedJobsMap).forEach(([name, info]) => {
          attentionContent += `<li><strong>${name}</strong> (${info.count}x): ${info.lastError}</li>`;
        });
        attentionContent += '</ul>';
      }

      body += box(attentionContent, 'error');
    }

    if (summary.totalExecutions === 0 && backupExecutions.length === 0) {
      body += box(
        `<p><strong>Note:</strong> No executions recorded since last report.</p>` +
        '<p>This could indicate:</p>' +
        '<ul>' +
          '<li>All jobs are scheduled outside this time window</li>' +
          '<li>The system was recently started</li>' +
          '<li>Jobs may not be running as expected</li>' +
        '</ul>',
        'warning'
      );
    } else {
      // Add backup summary section
      if (backupExecutions.length > 0) {
        body += '<h3>Backup Summary</h3>';
        body += tableStart(
          ['Backup', 'Status', 'Last Success', 'Age', 'Error'],
          {
            headerRowStyle: STYLES.headerRowBlue,
            columns: [{ align: 'left' }, { align: 'center' }, { align: 'center' }, { align: 'center' }, { align: 'left' }],
          }
        );

        // Group backups by name and get latest execution for each
        const backupsByName = {};
        backupExecutions.forEach(exec => {
          const backupName = exec.result?.backupName || exec.jobName.replace('monitor', '').replace('Backup', '');
          if (!backupsByName[backupName] || new Date(exec.timestamp) > new Date(backupsByName[backupName].timestamp)) {
            backupsByName[backupName] = exec;
          }
        });

        // Sort backups alphabetically and display with uppercase names
        Object.values(backupsByName)
          .sort((a, b) => {
            const nameA = (a.result?.backupName || a.jobName.replace('monitor', '').replace('Backup', '')).toUpperCase();
            const nameB = (b.result?.backupName || b.jobName.replace('monitor', '').replace('Backup', '')).toUpperCase();
            return nameA.localeCompare(nameB);
          })
          .forEach(backup => {
            const result = backup.result || {};
            const bStatusColor = backup.status === 'success' ? '#4caf50' : '#f44336';
            const statusText = backup.status === 'success' ? 'Success' : 'Failed';
            const backupName = (result.backupName || backup.jobName.replace('monitor', '').replace('Backup', '')).toUpperCase();

            // Calculate last success time and age
            let lastSuccessStr = '-';
            let ageStr = '-';
            if (result.lastBackupTime) {
              const lastBackupDate = new Date(result.lastBackupTime);
              lastSuccessStr = toWarsawTime(lastBackupDate);
              const ageMs = Date.now() - lastBackupDate.getTime();
              const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
              const ageDays = Math.floor(ageHours / 24);
              if (ageDays > 0) {
                ageStr = `${ageDays}d ${ageHours % 24}h`;
              } else {
                ageStr = `${ageHours}h`;
              }
            }

            // Get error message for failed backups
            const errorMsg = backup.status === 'failure'
              ? (backup.error?.message || backup.context?.error || '-')
              : '-';

            body += '<tr>'
              + tableCell(backupName, { style: 'font-weight: bold;' })
              + tableCell(statusText, { align: 'center', color: bStatusColor, style: 'font-weight: bold;' })
              + tableCell(lastSuccessStr, { align: 'center' })
              + tableCell(ageStr, { align: 'center' })
              + tableCell(errorMsg, { color: '#f44336' })
              + '</tr>';
          });

        body += tableEnd();
      }

      body += '<h3>Job Summary</h3>';
      body += tableStart(['Job Name', 'Success', 'Failed', 'Success Rate']);

      // Sort jobs by name for consistent reporting
      summary.jobStats.sort((a, b) => a.jobName.localeCompare(b.jobName));

      summary.jobStats.forEach(job => {
        const successRate = job.totalExecutions > 0
          ? ((job.successCount / job.totalExecutions) * 100).toFixed(0)
          : '0';

        const rateColor = job.failureCount === 0 ? '#4caf50' :
                         successRate >= 90 ? '#ff9800' : '#f44336';

        body += '<tr>'
          + tableCell(job.jobName)
          + tableCell(job.successCount, { align: 'center', color: '#4caf50' })
          + tableCell(job.failureCount, { align: 'center', color: '#f44336' })
          + tableCell(`${successRate}%`, { align: 'center', color: rateColor, style: 'font-weight: bold;' })
          + '</tr>';
      });

      body += tableEnd();

      // Add details for failed jobs
      const failedJobs = summary.jobStats.filter(job => job.failureCount > 0);
      if (failedJobs.length > 0) {
        body += '<h3 style="color: #f44336;">Jobs with Failures</h3>';

        failedJobs.forEach(job => {
          body += `
            <div style="background-color: #ffebee; padding: 10px; border-radius: 5px; margin: 10px 0; border-left: 4px solid #f44336;">
              <p><strong>${job.jobName}</strong></p>
              <p>Failures: ${job.failureCount}/${job.totalExecutions} executions</p>
              <p>Last failure: ${job.lastFailure || 'N/A'}</p>
              <p>Last success: ${job.lastSuccess || 'No recent successes'}</p>
            </div>
          `;
        });
      }

      // Add note about healthy systems if all are successful
      if (totalFailures === 0) {
        body += box(
          `<p><strong>All systems operational</strong></p>` +
          `<p>All ${summary.totalExecutions} jobs and ${backupExecutions.length} backups completed successfully.</p>`,
          'success'
        );
      }
    }

    const html = container(body);

    try {
      const emailAddresses = parseEmailAddresses(adminEmail);
      await axios.post(`${process.env.API_URL}/mailer`, {
        to: emailAddresses.join(','),
        subject,
        html,
      });
      
      // Update last summary sent timestamp after successful send
      this.lastSummarySentAt = new Date().toISOString();
      
      console.log(`Status summary sent to ${emailAddresses.length} recipient(s): Jobs ${summary.successfulExecutions}/${summary.failedExecutions}, Backups ${backupSuccessCount}/${backupFailureCount}`);
    } catch (sendError) {
      console.error('Failed to send status summary:', sendError.message);
    }
  }
}

// Create singleton instance
export const statusCollector = new StatusCollector();
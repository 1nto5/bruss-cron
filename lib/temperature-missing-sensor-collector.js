import axios from 'axios';
import { parseEmailAddresses } from './email-helper.js';
import { STYLES, tableCell, tableHeaderCell, tableStart, tableEnd, box, container } from './email-html.js';
import { toWarsawTime } from './format-helpers.js';

class TemperatureMissingSensorCollector {
  constructor() {
    this.missingSensors = [];
    this.maxEntries = 1000; // Prevent memory overflow
  }

  /**
   * Add missing sensor reading to collection
   * @param {string} oven - Oven name
   * @param {string} ip - IP address of the oven controller
   * @param {Array} processInfo - Active processes information
   * @param {Date} lastSuccessfulRead - Last successful sensor read timestamp
   * @param {Error} error - The error that occurred
   * @param {Date} timestamp - Timestamp of the failure
   */
  addMissingSensor(oven, ip, processInfo, lastSuccessfulRead, error, timestamp) {
    const entry = {
      oven,
      ip,
      processInfo,
      lastSuccessfulRead: lastSuccessfulRead ? lastSuccessfulRead.toISOString() : null,
      lastSuccessfulReadFormatted: lastSuccessfulRead ? toWarsawTime(lastSuccessfulRead) : 'Never',
      errorMessage: error.message,
      errorType: error.name,
      errorCode: error.code,
      timestamp: timestamp.toISOString(),
      timestampFormatted: toWarsawTime(timestamp),
    };

    this.missingSensors.push(entry);

    // Prevent memory overflow
    if (this.missingSensors.length > this.maxEntries) {
      this.missingSensors.shift(); // Remove oldest entry
    }
  }

  /**
   * Get all collected missing sensor entries and clear the collection
   */
  getAndClearMissingSensors() {
    const entries = [...this.missingSensors];
    this.missingSensors = [];
    return entries;
  }

  /**
   * Get missing sensor count
   */
  getMissingSensorsCount() {
    return this.missingSensors.length;
  }

  /**
   * Group missing sensor entries by oven name
   */
  groupByOven(entries) {
    const grouped = {};

    entries.forEach((entry) => {
      if (!grouped[entry.oven]) {
        grouped[entry.oven] = [];
      }
      grouped[entry.oven].push(entry);
    });

    return grouped;
  }

  /**
   * Send batch notification with all collected missing sensor readings
   */
  async sendBatchNotification() {
    const entries = this.getAndClearMissingSensors();

    if (entries.length === 0) {
      // Silent when no missing sensors - no email, no console log
      return;
    }

    const adminEmail = process.env.ADMIN_EMAIL;

    if (!adminEmail) {
      console.error('ADMIN_EMAIL is not configured in environment variables');
      return;
    }

    const now = toWarsawTime();

    const groupedEntries = this.groupByOven(entries);
    const ovenNames = Object.keys(groupedEntries);
    const subject = `[CRON] Missing Oven Sensor Readings - ${entries.length} failures in ${ovenNames.length} ovens - ${now}`;

    // Create summary statistics
    const summary = ovenNames.map((oven) => {
      const ovenEntries = groupedEntries[oven];
      return {
        oven,
        count: ovenEntries.length,
        firstOccurrence: ovenEntries[0].timestampFormatted,
        lastOccurrence: ovenEntries[ovenEntries.length - 1].timestampFormatted,
        ip: ovenEntries[0].ip,
      };
    });

    // Build HTML email
    let body = `<h2 style="color: #d32f2f;">🔴 Missing Oven Sensor Readings - Last Hour</h2>`;

    body += box(
      `<p><strong>Total Failed Readings:</strong> ${entries.length}</p>` +
      `<p><strong>Ovens Affected:</strong> ${ovenNames.length}</p>`,
      'errorAlt'
    );

    body += '<h3>Summary</h3>';
    body += tableStart(['Oven', 'IP Address', 'Failure Count', 'First Occurrence', 'Last Occurrence']);

    summary.forEach((item) => {
      body += '<tr>'
        + tableCell(item.oven.toUpperCase())
        + tableCell(item.ip, { align: 'center' })
        + tableCell(item.count, { align: 'center' })
        + tableCell(item.firstOccurrence, { align: 'center', style: STYLES.cellSmall })
        + tableCell(item.lastOccurrence, { align: 'center', style: STYLES.cellSmall })
        + '</tr>';
    });

    body += tableEnd();
    body += '<h3>Failure Details</h3>';

    // Add detailed entries grouped by oven
    ovenNames.forEach((oven) => {
      const ovenEntries = groupedEntries[oven];

      body += `
        <div style="margin: 20px 0; border: 1px solid #d32f2f; border-radius: 5px; padding: 10px; background-color: #ffebee;">
          <h4 style="color: #d32f2f; margin-top: 0;">Oven ${oven.toUpperCase()} (${ovenEntries.length} failures)</h4>
      `;

      ovenEntries.forEach((entry) => {
        const { ip, processInfo, lastSuccessfulReadFormatted, errorMessage, errorType, timestampFormatted } = entry;

        const processRows = processInfo.map(proc =>
          `<tr><td style="border: 1px solid #ccc; padding: 6px;">${proc.hydraBatch || 'N/A'}</td><td style="border: 1px solid #ccc; padding: 6px;">${proc.article || 'N/A'}</td><td style="border: 1px solid #ccc; padding: 6px;">${proc.status}</td><td style="border: 1px solid #ccc; padding: 6px; font-size: 11px;">${proc.startTime ? toWarsawTime(new Date(proc.startTime)) : 'N/A'}</td></tr>`
        ).join('');

        body += `
          <div style="background-color: #fff; padding: 15px; border-radius: 3px; margin: 10px 0; border-left: 4px solid #d32f2f;">
            <p><strong>Time:</strong> ${timestampFormatted}</p>
            <p><strong>IP Address:</strong> ${ip}</p>
            <p><strong>Last Successful Read:</strong> ${lastSuccessfulReadFormatted}</p>
            <p><strong>Error Type:</strong> ${errorType || 'Unknown'}</p>
            <p><strong>Error Message:</strong> ${errorMessage}</p>

            <details style="margin-top: 10px;">
              <summary style="cursor: pointer; color: #666;">Show active processes</summary>

              <h4 style="margin-top: 15px;">Active Processes</h4>
              <table style="border-collapse: collapse; width: 100%; margin: 10px 0;">
                <tr style="${STYLES.headerRow}">
                  ${tableHeaderCell('Hydra Batch')}
                  ${tableHeaderCell('Article')}
                  ${tableHeaderCell('Status')}
                  ${tableHeaderCell('Start Time')}
                </tr>
                ${processRows}
              </table>
            </details>
          </div>
        `;
      });

      body += '</div>';
    });

    body += box(
      '<p><em>Note: Failed sensor readings indicate connection issues with oven controllers. Check network connectivity and controller status.</em></p>',
      'blueInfo'
    );

    const html = container(body);

    try {
      const emailAddresses = parseEmailAddresses(adminEmail);
      await axios.post(`${process.env.API_URL}/mailer`, {
        to: emailAddresses.join(','),
        subject,
        html,
      });
      console.log(
        `Batch missing sensor notification sent: ${entries.length} failures from ${ovenNames.length} ovens to ${emailAddresses.length} recipient(s)`
      );
    } catch (sendError) {
      console.error(
        `Failed to send batch missing sensor notification (${entries.length} entries lost):`,
        sendError.message
      );
    }
  }
}

// Create singleton instance
export const temperatureMissingSensorCollector = new TemperatureMissingSensorCollector();


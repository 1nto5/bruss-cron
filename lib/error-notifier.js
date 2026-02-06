import { errorCollector } from './error-collector.js';
import { statusCollector } from './status-collector.js';

/**
 * Wrapper function to execute cron job with status tracking, error handling and notifications
 * @param {string} jobName - Name of the cron job
 * @param {Function} jobFunction - The actual job function to execute
 */
export async function executeJobWithStatusTracking(jobName, jobFunction) {
  try {
    const result = await jobFunction();

    // Track successful execution
    statusCollector.addSuccess(jobName, result);

    return result;
  } catch (error) {
    console.error(`Error in ${jobName}:`, error);
    // Pass error context if available
    const context = error.context || {};

    // Add error to collector for batch notification
    errorCollector.addError(jobName, error, context);

    // Track failed execution
    statusCollector.addFailure(jobName, error, context);

    // Re-throw to maintain original error behavior
    throw error;
  }
}

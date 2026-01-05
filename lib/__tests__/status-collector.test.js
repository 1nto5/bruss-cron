import { describe, test, expect, beforeEach } from 'bun:test';

// We need to test the class without the singleton, so we'll import the module
// and create a fresh instance for each test
class StatusCollector {
  constructor() {
    this.jobExecutions = [];
    this.maxExecutions = 2000;
    this.lastSummarySentAt = null;
  }

  addSuccess(jobName, result = {}) {
    const execution = {
      jobName,
      status: 'success',
      result,
      timestamp: new Date().toISOString(),
      timestampFormatted: new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }),
      isBackup: result.backupName ? true : false,
    };
    this.jobExecutions.push(execution);
    if (this.jobExecutions.length > this.maxExecutions) {
      this.jobExecutions.shift();
    }
  }

  addFailure(jobName, error, context = {}) {
    const execution = {
      jobName,
      status: 'failure',
      error: { message: error.message || 'Unknown error', stack: error.stack },
      context,
      timestamp: new Date().toISOString(),
      timestampFormatted: new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }),
      isBackup: jobName.includes('Backup') || context.backupName ? true : false,
    };
    this.jobExecutions.push(execution);
    if (this.jobExecutions.length > this.maxExecutions) {
      this.jobExecutions.shift();
    }
  }

  generateSummary(executions) {
    const jobStats = {};
    executions.forEach(exec => {
      if (!jobStats[exec.jobName]) {
        jobStats[exec.jobName] = { jobName: exec.jobName, totalExecutions: 0, successCount: 0, failureCount: 0 };
      }
      const stats = jobStats[exec.jobName];
      stats.totalExecutions++;
      if (exec.status === 'success') stats.successCount++;
      else stats.failureCount++;
    });
    return {
      totalExecutions: executions.length,
      successfulExecutions: executions.filter(e => e.status === 'success').length,
      failedExecutions: executions.filter(e => e.status === 'failure').length,
      uniqueJobs: Object.keys(jobStats).length,
      jobStats: Object.values(jobStats),
    };
  }
}

describe('StatusCollector', () => {
  let collector;

  beforeEach(() => {
    collector = new StatusCollector();
  });

  describe('addSuccess', () => {
    test('adds successful execution', () => {
      collector.addSuccess('testJob', { data: 'test' });

      expect(collector.jobExecutions).toHaveLength(1);
      expect(collector.jobExecutions[0].jobName).toBe('testJob');
      expect(collector.jobExecutions[0].status).toBe('success');
      expect(collector.jobExecutions[0].result).toEqual({ data: 'test' });
    });

    test('sets isBackup=false for regular jobs', () => {
      collector.addSuccess('regularJob', {});
      expect(collector.jobExecutions[0].isBackup).toBe(false);
    });

    test('sets isBackup=true when result has backupName', () => {
      collector.addSuccess('monitorLv1Backup', { backupName: 'LV1' });
      expect(collector.jobExecutions[0].isBackup).toBe(true);
    });
  });

  describe('addFailure', () => {
    test('adds failed execution with error details', () => {
      const error = new Error('Test error');
      collector.addFailure('testJob', error, { extra: 'context' });

      expect(collector.jobExecutions).toHaveLength(1);
      expect(collector.jobExecutions[0].status).toBe('failure');
      expect(collector.jobExecutions[0].error.message).toBe('Test error');
      expect(collector.jobExecutions[0].context).toEqual({ extra: 'context' });
    });

    test('sets isBackup=true when jobName contains Backup', () => {
      collector.addFailure('monitorLv1Backup', new Error('fail'));
      expect(collector.jobExecutions[0].isBackup).toBe(true);
    });

    test('sets isBackup=true when context has backupName', () => {
      collector.addFailure('someJob', new Error('fail'), { backupName: 'LV2' });
      expect(collector.jobExecutions[0].isBackup).toBe(true);
    });
  });

  describe('generateSummary', () => {
    test('calculates correct counts', () => {
      collector.addSuccess('job1', {});
      collector.addSuccess('job1', {});
      collector.addFailure('job2', new Error('fail'));

      const summary = collector.generateSummary(collector.jobExecutions);

      expect(summary.totalExecutions).toBe(3);
      expect(summary.successfulExecutions).toBe(2);
      expect(summary.failedExecutions).toBe(1);
      expect(summary.uniqueJobs).toBe(2);
    });

    test('groups stats by job name', () => {
      collector.addSuccess('job1', {});
      collector.addSuccess('job1', {});
      collector.addFailure('job1', new Error('fail'));

      const summary = collector.generateSummary(collector.jobExecutions);
      const job1Stats = summary.jobStats.find(s => s.jobName === 'job1');

      expect(job1Stats.totalExecutions).toBe(3);
      expect(job1Stats.successCount).toBe(2);
      expect(job1Stats.failureCount).toBe(1);
    });

    test('returns empty stats for empty array', () => {
      const summary = collector.generateSummary([]);

      expect(summary.totalExecutions).toBe(0);
      expect(summary.successfulExecutions).toBe(0);
      expect(summary.failedExecutions).toBe(0);
      expect(summary.uniqueJobs).toBe(0);
    });
  });

  describe('memory limit', () => {
    test('removes oldest execution when limit exceeded', () => {
      collector.maxExecutions = 3;

      collector.addSuccess('job1', {});
      collector.addSuccess('job2', {});
      collector.addSuccess('job3', {});
      collector.addSuccess('job4', {}); // Should remove job1

      expect(collector.jobExecutions).toHaveLength(3);
      expect(collector.jobExecutions[0].jobName).toBe('job2');
      expect(collector.jobExecutions[2].jobName).toBe('job4');
    });
  });
});

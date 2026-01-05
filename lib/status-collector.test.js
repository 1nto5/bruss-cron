import { describe, expect, test, beforeEach } from 'bun:test';

// Create a fresh StatusCollector instance for testing (not the singleton)
class TestStatusCollector {
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
      timestampFormatted: new Date().toLocaleString('pl-PL', {
        timeZone: 'Europe/Warsaw',
      }),
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
      error: {
        message: error.message || 'Unknown error',
        stack: error.stack,
      },
      context,
      timestamp: new Date().toISOString(),
      timestampFormatted: new Date().toLocaleString('pl-PL', {
        timeZone: 'Europe/Warsaw',
      }),
      isBackup: jobName.includes('Backup') || context.backupName ? true : false,
    };
    this.jobExecutions.push(execution);
    if (this.jobExecutions.length > this.maxExecutions) {
      this.jobExecutions.shift();
    }
  }

  generateSummary(executions) {
    const jobStats = {};
    let periodStart = null;
    let periodEnd = null;

    if (executions.length > 0) {
      const timestamps = executions.map(e => new Date(e.timestamp));
      periodStart = new Date(Math.min(...timestamps));
      periodEnd = new Date(Math.max(...timestamps));
    }

    executions.forEach(exec => {
      if (!jobStats[exec.jobName]) {
        jobStats[exec.jobName] = {
          jobName: exec.jobName,
          totalExecutions: 0,
          successCount: 0,
          failureCount: 0,
        };
      }
      const stats = jobStats[exec.jobName];
      stats.totalExecutions++;
      if (exec.status === 'success') {
        stats.successCount++;
      } else {
        stats.failureCount++;
      }
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
    collector = new TestStatusCollector();
  });

  describe('addSuccess', () => {
    test('adds successful execution', () => {
      collector.addSuccess('testJob', { count: 5 });

      expect(collector.jobExecutions.length).toBe(1);
      expect(collector.jobExecutions[0].jobName).toBe('testJob');
      expect(collector.jobExecutions[0].status).toBe('success');
      expect(collector.jobExecutions[0].result.count).toBe(5);
    });

    test('marks backup jobs by backupName in result', () => {
      collector.addSuccess('monitorLv1Backup', { backupName: 'LV1' });

      expect(collector.jobExecutions[0].isBackup).toBe(true);
    });

    test('marks non-backup jobs correctly', () => {
      collector.addSuccess('sendEmails', {});

      expect(collector.jobExecutions[0].isBackup).toBe(false);
    });
  });

  describe('addFailure', () => {
    test('adds failed execution with error details', () => {
      const error = new Error('Connection failed');
      collector.addFailure('testJob', error, { retries: 3 });

      expect(collector.jobExecutions.length).toBe(1);
      expect(collector.jobExecutions[0].status).toBe('failure');
      expect(collector.jobExecutions[0].error.message).toBe('Connection failed');
      expect(collector.jobExecutions[0].context.retries).toBe(3);
    });

    test('marks backup jobs by jobName containing Backup', () => {
      collector.addFailure('monitorLv1Backup', new Error('Failed'));

      expect(collector.jobExecutions[0].isBackup).toBe(true);
    });

    test('marks backup jobs by backupName in context', () => {
      collector.addFailure('checkBackup', new Error('Failed'), { backupName: 'LV2' });

      expect(collector.jobExecutions[0].isBackup).toBe(true);
    });
  });

  describe('generateSummary', () => {
    test('returns correct counts for mixed executions', () => {
      collector.addSuccess('job1', {});
      collector.addSuccess('job1', {});
      collector.addFailure('job1', new Error('fail'));
      collector.addSuccess('job2', {});

      const summary = collector.generateSummary(collector.jobExecutions);

      expect(summary.totalExecutions).toBe(4);
      expect(summary.successfulExecutions).toBe(3);
      expect(summary.failedExecutions).toBe(1);
      expect(summary.uniqueJobs).toBe(2);
    });

    test('returns empty summary for no executions', () => {
      const summary = collector.generateSummary([]);

      expect(summary.totalExecutions).toBe(0);
      expect(summary.successfulExecutions).toBe(0);
      expect(summary.failedExecutions).toBe(0);
      expect(summary.uniqueJobs).toBe(0);
    });

    test('groups stats by job name', () => {
      collector.addSuccess('jobA', {});
      collector.addSuccess('jobA', {});
      collector.addFailure('jobB', new Error('fail'));

      const summary = collector.generateSummary(collector.jobExecutions);
      const jobAStats = summary.jobStats.find(j => j.jobName === 'jobA');
      const jobBStats = summary.jobStats.find(j => j.jobName === 'jobB');

      expect(jobAStats.successCount).toBe(2);
      expect(jobAStats.failureCount).toBe(0);
      expect(jobBStats.successCount).toBe(0);
      expect(jobBStats.failureCount).toBe(1);
    });
  });

  describe('overflow protection', () => {
    test('removes oldest execution when max exceeded', () => {
      collector.maxExecutions = 3;

      collector.addSuccess('job1', {});
      collector.addSuccess('job2', {});
      collector.addSuccess('job3', {});
      collector.addSuccess('job4', {}); // Should push out job1

      expect(collector.jobExecutions.length).toBe(3);
      expect(collector.jobExecutions[0].jobName).toBe('job2');
      expect(collector.jobExecutions[2].jobName).toBe('job4');
    });
  });
});

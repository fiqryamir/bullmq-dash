import type {
  JobCleanStatus,
  JobCounts,
  JobLogs,
  JobStatus,
  QueueAdapterOptions,
  QueueJob,
  QueueType,
  Status,
} from '../typings/app';
import { BaseAdapter } from '../queueAdapters/base';

export class TestQueueAdapter extends BaseAdapter {
  constructor(
    public readonly name: string = 'test',
    options: Partial<QueueAdapterOptions> = {},
    type: QueueType = 'bullmq'
  ) {
    super(type, options);
  }

  getName(): string {
    return this.name;
  }

  async getJobCounts(): Promise<JobCounts> {
    return {
      latest: 0,
      active: 0,
      waiting: 0,
      'waiting-children': 0,
      prioritized: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      paused: 0,
    };
  }

  async getJobs(_jobStatuses: JobStatus[], _start?: number, _end?: number): Promise<QueueJob[]> {
    return [];
  }

  async getJob(_jobId: string): Promise<QueueJob | null> {
    return null;
  }

  async getJobLogs(_jobId: string, _start: number, _end: number): Promise<JobLogs> {
    return { logs: [], count: 0 };
  }

  async isPaused(): Promise<boolean> {
    return false;
  }

  async getGlobalConcurrency(): Promise<number | null> {
    return null;
  }

  async getJobSchedulersCount(): Promise<number> {
    return 0;
  }

  async pause(): Promise<void> {}

  async resume(): Promise<void> {}

  async empty(): Promise<void> {}

  async promoteAll(): Promise<void> {}

  async clean(_jobStatus: JobCleanStatus, _graceTimeMs: number): Promise<void> {}

  getStatuses(): Status[] {
    return ['latest', ...this.getJobStatuses()];
  }

  getJobStatuses(): JobStatus[] {
    return ['active', 'waiting', 'completed', 'failed', 'delayed'];
  }
}

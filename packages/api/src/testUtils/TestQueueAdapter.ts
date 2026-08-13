import type {
  JobCounts,
  JobStatus,
  QueueAdapterOptions,
  QueueJob,
  Status,
} from '../typings/app';
import { BaseAdapter } from '../queueAdapters/base';

export class TestQueueAdapter extends BaseAdapter {
  constructor(
    public readonly name: string = 'test',
    options: Partial<QueueAdapterOptions> = {}
  ) {
    super('bullmq', options);
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

  async getJobLogs(
    _jobId: string,
    _start: number,
    _end: number
  ): Promise<{ logs: string[]; count: number }> {
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

  getStatuses(): Status[] {
    return ['latest', ...this.getJobStatuses()];
  }

  getJobStatuses(): JobStatus[] {
    return ['active', 'waiting', 'completed', 'failed', 'delayed'];
  }
}

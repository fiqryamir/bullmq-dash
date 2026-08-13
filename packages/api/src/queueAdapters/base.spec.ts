import { describe, expect, it } from 'vitest';
import type {
  BullBoardRequest,
  JobCounts,
  JobStatus,
  QueueAdapterOptions,
  QueueJob,
  Status,
} from '../typings/app';
import { BaseAdapter } from './base';

class TestAdapter extends BaseAdapter {
  constructor(options: Partial<QueueAdapterOptions> = {}) {
    super('bullmq', options);
  }

  getName(): string {
    return 'test';
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
    return ['latest'];
  }

  getJobStatuses(): JobStatus[] {
    return ['waiting'];
  }

  public normalize(clients: Record<string, string>[] | null, separator?: string) {
    return this.normalizeWorkers(clients, separator);
  }
}

const request = (): BullBoardRequest => ({
  queues: new Map(),
  uiConfig: {},
  query: {},
  params: {},
  body: {},
  headers: {},
});

describe('BaseAdapter', () => {
  it('derives its option flags from the constructor options', () => {
    const adapter = new TestAdapter({
      readOnlyMode: true,
      prefix: 'custom:',
      description: 'queue description',
      displayName: 'Shown name',
    });

    expect(adapter.readOnlyMode).toBe(true);
    expect(adapter.allowRetries).toBe(false);
    expect(adapter.allowCompletedRetries).toBe(false);
    expect(adapter.prefix).toBe('custom:');
    expect(adapter.description).toBe('queue description');
    expect(adapter.displayName).toBe('Shown name');
    expect(adapter.type).toBe('bullmq');
  });

  it('allows retries by default and completed retries unless disabled', () => {
    expect(new TestAdapter().allowRetries).toBe(true);
    expect(new TestAdapter().allowCompletedRetries).toBe(true);
    expect(new TestAdapter({ allowCompletedRetries: false }).allowCompletedRetries).toBe(false);
    expect(new TestAdapter({ allowRetries: false }).allowCompletedRetries).toBe(false);
  });

  it('returns the display name and description', () => {
    const adapter = new TestAdapter({ displayName: 'Shown', description: 'Desc' });
    expect(adapter.getDisplayName()).toBe('Shown');
    expect(adapter.getDescription()).toBe('Desc');
  });

  it('formats fields through registered formatters and falls back to the raw value', () => {
    const adapter = new TestAdapter();
    adapter.setFormatter('name', (job) => `job:${(job as { name: string }).name}`);

    expect(adapter.format('name', { name: 'x' })).toBe('job:x');
    expect(adapter.format('data', { raw: true })).toEqual({ raw: true });
  });

  it('is visible by default and honors a visibility guard', () => {
    const adapter = new TestAdapter();
    expect(adapter.isVisible(request())).toBe(true);

    adapter.setVisibilityGuard(() => false);
    expect(adapter.isVisible(request())).toBe(false);
  });

  it('reports no workers by default', async () => {
    expect(await new TestAdapter().getWorkers()).toBeNull();
  });

  describe('normalizeWorkers', () => {
    it('returns null when the client list is unavailable', () => {
      expect(new TestAdapter().normalize(null)).toBeNull();
    });

    it('returns an empty list when no clients are connected', () => {
      expect(new TestAdapter().normalize([])).toEqual([]);
    });

    it('returns null when a provider hides the client list behind a placeholder', () => {
      const adapter = new TestAdapter();
      expect(
        adapter.normalize([{ name: 'GCP does not support client list' }])
      ).toBeNull();
    });

    it('parses name, addr and age from client entries', () => {
      const adapter = new TestAdapter();
      expect(
        adapter.normalize(
          [
            {
              id: '42',
              addr: '127.0.0.1:1234',
              age: '7',
              rawname: 'bull:queue:w:consumer',
            },
          ],
          ':w:'
        )
      ).toEqual([{ id: '42', name: 'consumer', addr: '127.0.0.1:1234', age: 7 }]);
    });

    it('leaves unnamed workers unnamed', () => {
      const adapter = new TestAdapter();
      expect(
        adapter.normalize([{ id: '42', addr: '127.0.0.1:1234', name: 'bull:queue' }], ':w:')
      ).toEqual([{ id: '42', name: null, addr: '127.0.0.1:1234', age: 0 }]);
    });
  });
});

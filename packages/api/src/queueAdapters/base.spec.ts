import { describe, expect, it } from 'vitest';
import type { BullBoardRequest } from '../typings/app';
import { TestQueueAdapter } from '../testUtils/TestQueueAdapter';

class WorkerListAdapter extends TestQueueAdapter {
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
    const adapter = new TestQueueAdapter('test', {
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
    expect(new TestQueueAdapter().allowRetries).toBe(true);
    expect(new TestQueueAdapter().allowCompletedRetries).toBe(true);
    expect(new TestQueueAdapter('test', { allowCompletedRetries: false }).allowCompletedRetries).toBe(false);
    expect(new TestQueueAdapter('test', { allowRetries: false }).allowCompletedRetries).toBe(false);
  });

  it('returns the display name and description', () => {
    const adapter = new TestQueueAdapter('test', { displayName: 'Shown', description: 'Desc' });
    expect(adapter.getDisplayName()).toBe('Shown');
    expect(adapter.getDescription()).toBe('Desc');
  });

  it('formats fields through registered formatters and falls back to the raw value', () => {
    const adapter = new TestQueueAdapter();
    adapter.setFormatter('name', (job) => `job:${(job as { name: string }).name}`);

    expect(adapter.format('name', { name: 'x' })).toBe('job:x');
    expect(adapter.format('data', { raw: true })).toEqual({ raw: true });
  });

  it('is visible by default and honors a visibility guard', () => {
    const adapter = new TestQueueAdapter();
    expect(adapter.isVisible(request())).toBe(true);

    adapter.setVisibilityGuard(() => false);
    expect(adapter.isVisible(request())).toBe(false);
  });

  it('reports no workers by default', async () => {
    expect(await new TestQueueAdapter().getWorkers()).toBeNull();
  });

  describe('normalizeWorkers', () => {
    it('returns null when the client list is unavailable', () => {
      expect(new WorkerListAdapter().normalize(null)).toBeNull();
    });

    it('returns an empty list when no clients are connected', () => {
      expect(new WorkerListAdapter().normalize([])).toEqual([]);
    });

    it('returns null when a provider hides the client list behind a placeholder', () => {
      const adapter = new WorkerListAdapter();
      expect(adapter.normalize([{ name: 'GCP does not support client list' }])).toBeNull();
    });

    it('parses name, addr and age from client entries', () => {
      const adapter = new WorkerListAdapter();
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
      const adapter = new WorkerListAdapter();
      expect(
        adapter.normalize([{ id: '42', addr: '127.0.0.1:1234', name: 'bull:queue' }], ':w:')
      ).toEqual([{ id: '42', name: null, addr: '127.0.0.1:1234', age: 0 }]);
    });
  });
});

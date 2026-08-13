import { randomUUID } from 'node:crypto';
import { Queue, Worker } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pollUntil } from '../testUtils/pollUntil';
import { BullMQAdapter } from './bullMQ';

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
};

describe('BullMQAdapter', () => {
  const queueName = `bullmq-dash-test-${randomUUID()}`;
  let queue: Queue;
  let adapter: BullMQAdapter;

  beforeAll(async () => {
    queue = new Queue(queueName, { connection });

    const worker = new Worker(
      queueName,
      async (job) => {
        if (job.name === 'failed-job') {
          throw new Error('boom');
        }
        return 'result';
      },
      { connection }
    );

    const completedJob = await queue.add('done-job', { payload: 4 });
    const failedJob = await queue.add('failed-job', { payload: 5 });

    await pollUntil(
      async () => (await completedJob.isCompleted()) && (await failedJob.isFailed()),
      10_000
    );
    await worker.close();

    await queue.add('waiting-job', { payload: 1 });
    await queue.add('waiting-job', { payload: 2 });
    await queue.add('delayed-job', { payload: 3 }, { delay: 60_000 });

    adapter = new BullMQAdapter(queue);
  }, 30_000);

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
  }, 30_000);

  it('returns the queue name', () => {
    expect(adapter.getName()).toBe(queueName);
  });

  it('throws when constructed with a non-BullMQ queue', () => {
    expect(() => new BullMQAdapter({} as Queue)).toThrow(
      `You've used the BullMQ adapter with a non-BullMQ queue.`
    );
  });

  it('reports the count of jobs in each state', async () => {
    const counts = await adapter.getJobCounts();
    expect(counts.waiting).toBe(2);
    expect(counts.delayed).toBe(1);
    expect(counts.completed).toBe(1);
    expect(counts.failed).toBe(1);
    expect(counts.active).toBe(0);
  });

  it('exposes latest and every job state as statuses', () => {
    expect(adapter.getStatuses()).toEqual([
      'latest',
      'active',
      'waiting',
      'waiting-children',
      'prioritized',
      'completed',
      'failed',
      'delayed',
      'paused',
    ]);
    expect(adapter.getJobStatuses()).not.toContain('latest');
  });

  it('reports no paused jobs while the queue is not paused', async () => {
    expect(await adapter.getJobCountForStatus('paused')).toBe(0);
    expect(await adapter.getJobs(['paused'])).toEqual([]);
  });

  it('lists the paused queue jobs under the paused state', async () => {
    await queue.pause();
    expect(await adapter.getJobCountForStatus('paused')).toBe(2);
    const pausedJobs = await adapter.getJobs(['paused']);
    expect(pausedJobs.map((job) => job.name)).toEqual(['waiting-job', 'waiting-job']);
    await queue.resume();
  });

  it('pages jobs in a state', async () => {
    const firstPage = await adapter.getJobs(['waiting'], 0, 0);
    expect(firstPage).toHaveLength(1);
    expect(firstPage[0]?.name).toBe('waiting-job');

    const all = await adapter.getJobs(['waiting']);
    expect(all).toHaveLength(2);
  });

  it('reports the pause state', async () => {
    expect(await adapter.isPaused()).toBe(false);
    await queue.pause();
    expect(await adapter.isPaused()).toBe(true);
    await queue.resume();
  });

  it('reports no global concurrency by default', async () => {
    expect(await adapter.getGlobalConcurrency()).toBeNull();
  });

  it('reports no job schedulers by default', async () => {
    expect(await adapter.getJobSchedulersCount()).toBe(0);
  });
});

describe('BullMQAdapter workers', () => {
  const queueName = `bullmq-dash-test-workers-${randomUUID()}`;
  let queue: Queue;
  let adapter: BullMQAdapter;
  let worker: Worker | undefined;

  beforeAll(async () => {
    queue = new Queue(queueName, { connection });
    adapter = new BullMQAdapter(queue);
  }, 30_000);

  afterAll(async () => {
    await worker?.close();
    await queue.obliterate({ force: true });
    await queue.close();
  }, 30_000);

  it('reports an empty worker list when nobody consumes the queue', async () => {
    expect(await adapter.getWorkers()).toEqual([]);
  }, 15_000);

  it('reports connected workers with their names', async () => {
    worker = new Worker(queueName, async () => {}, { connection, name: 'test-worker' });
    await worker.waitUntilReady();
    const workers = await adapter.getWorkers();
    expect(workers?.some((entry) => entry.name === 'test-worker')).toBe(true);
  }, 15_000);
});

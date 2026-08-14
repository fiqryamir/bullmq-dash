import { randomUUID } from 'node:crypto';
import { Queue, Worker, type RedisClient } from 'bullmq';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pollUntil } from '../testUtils/pollUntil';
import { eventTimestampMs, MetricsCapture } from './capture';
import { MetricsStore, minuteIndex } from './store';

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
};

describe('eventTimestampMs', () => {
  it('reads the millisecond timestamp off a stream entry id', () => {
    expect(eventTimestampMs('1723654800000-3')).toBe(1723654800000);
  });

  it('answers 0 for an unparsable id', () => {
    expect(eventTimestampMs('nope')).toBe(0);
  });
});

describe('MetricsCapture', () => {
  const queueName = `bullmq-dash-test-metrics-capture-${randomUUID()}`;
  const uncapturedQueueName = `bullmq-dash-test-metrics-uncaptured-${randomUUID()}`;
  let queue: Queue;
  let uncapturedQueue: Queue;
  let worker: Worker;
  let client: Redis;
  let store: MetricsStore;
  let capture: MetricsCapture;

  beforeAll(async () => {
    queue = new Queue(queueName, { connection });
    uncapturedQueue = new Queue(uncapturedQueueName, { connection });

    // No `metrics` option: the worker proves event-derived capture needs no
    // worker-side configuration.
    worker = new Worker(
      queueName,
      async (job) => {
        if (job.name === 'boom') {
          throw new Error('boom');
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      },
      { connection }
    );
    await worker.waitUntilReady();

    client = new Redis(connection);
    store = new MetricsStore(client as unknown as RedisClient);
    capture = new MetricsCapture(store);
    await capture.addQueue(queueName, { queueName, client: client as unknown as RedisClient });
  }, 30_000);

  afterAll(async () => {
    await capture.close();
    await worker.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await uncapturedQueue.obliterate({ force: true });
    await uncapturedQueue.close();
    await client.quit();
  }, 30_000);

  /**
   * The totals across the last two minutes, so assertions survive a minute
   * boundary rolling over mid-test.
   */
  const totals = async (queue: string) => {
    const now = minuteIndex(Date.now());
    const buckets = await store.getBuckets(queue, now - 1, now);
    return buckets.reduce(
      (sum, bucket) => ({
        completed: sum.completed + bucket.completed,
        failed: sum.failed + bucket.failed,
        durationCount: sum.durationCount + bucket.durationCount,
        durationSum: sum.durationSum + bucket.durationSum,
        waitCount: sum.waitCount + bucket.waitCount,
        waitSum: sum.waitSum + bucket.waitSum,
      }),
      { completed: 0, failed: 0, durationCount: 0, durationSum: 0, waitCount: 0, waitSum: 0 }
    );
  };

  it('records completed and failed counts, duration and wait from queue events', async () => {
    // The event consumer subscribes asynchronously; a warm-up job that the
    // store observes proves the subscription is live before the assertions,
    // whose deltas then cannot be skewed by the startup window.
    await queue.add('warmup', {});
    await pollUntil(async () => (await totals(queueName)).completed >= 1, 15_000);
    const before = await totals(queueName);

    await queue.add('ok', { i: 1 });
    await queue.add('ok', { i: 2 });
    await queue.add('ok', { i: 3 });
    await queue.add('boom', { i: 4 });

    await pollUntil(async () => {
      const current = await totals(queueName);
      return current.completed >= before.completed + 3 && current.failed >= before.failed + 1;
    }, 15_000);

    const bucket = await totals(queueName);
    expect(bucket.completed - before.completed).toBe(3);
    expect(bucket.failed - before.failed).toBe(1);
    // Every finished job contributes a duration sample (active → finished)
    // and a wait sample (waiting → active).
    expect(bucket.durationCount - before.durationCount).toBe(4);
    expect(bucket.waitCount - before.waitCount).toBe(4);
    expect(bucket.durationSum - before.durationSum).toBeGreaterThanOrEqual(300);
    expect(bucket.waitSum - before.waitSum).toBeGreaterThan(0);
  }, 20_000);

  it('does not capture queues that are not registered', async () => {
    await uncapturedQueue.add('uncaptured', {});

    await new Promise((resolve) => setTimeout(resolve, 200));

    const bucket = await totals(uncapturedQueueName);
    expect(bucket.completed).toBe(0);
    expect(bucket.failed).toBe(0);
    expect(bucket.waitCount).toBe(0);
    expect(bucket.durationCount).toBe(0);
  }, 15_000);

  it('keeps capturing while jobs flow through the queue', async () => {
    const before = await totals(queueName);

    await queue.add('ok', { i: 5 });
    await queue.add('ok', { i: 6 });

    await pollUntil(
      async () => (await totals(queueName)).completed >= before.completed + 2,
      15_000
    );

    const bucket = await totals(queueName);
    expect(bucket.durationCount - before.durationCount).toBe(2);
    expect(bucket.waitCount - before.waitCount).toBe(2);
  }, 20_000);

  it('captures queues that live under a Redis key prefix', async () => {
    const prefix = `bullmq-dash-test-prefix-${randomUUID()}`;
    const prefixedQueueName = `bullmq-dash-test-metrics-prefixed-${randomUUID()}`;
    const prefixedQueue = new Queue(prefixedQueueName, { connection, prefix });
    const prefixedWorker = new Worker(
      prefixedQueueName,
      async (job) => {
        if (job.name === 'boom') {
          throw new Error('boom');
        }
      },
      { connection, prefix }
    );
    await prefixedWorker.waitUntilReady();

    const prefixedCapture = new MetricsCapture(store);
    try {
      await prefixedCapture.addQueue(prefixedQueueName, {
        queueName: prefixedQueueName,
        client: client as unknown as RedisClient,
        prefix,
      });
      // The warm-up job is delayed so the capture's consumer is subscribed
      // before its events are written — the first job's early events can
      // otherwise be missed in the subscription window.
      await prefixedQueue.add('warmup', {}, { delay: 300 });
      await pollUntil(async () => (await totals(prefixedQueueName)).completed >= 1, 15_000);
      const before = await totals(prefixedQueueName);

      await prefixedQueue.add('ok', {});
      await pollUntil(
        async () => (await totals(prefixedQueueName)).completed >= before.completed + 1,
        15_000
      );
      expect((await totals(prefixedQueueName)).durationCount - before.durationCount).toBe(1);
    } finally {
      await prefixedCapture.close();
      await prefixedWorker.close();
      await prefixedQueue.obliterate({ force: true });
      await prefixedQueue.close();
    }
  }, 25_000);
});




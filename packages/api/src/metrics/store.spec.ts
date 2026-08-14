import { randomUUID } from 'node:crypto';
import { Queue, type RedisClient } from 'bullmq';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pollUntil } from '../testUtils/pollUntil';
import {
  DEFAULT_METRICS_PREFIX,
  DEFAULT_METRICS_RETENTION_SECONDS,
  MetricsStore,
  minuteIndex,
} from './store';

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
};

describe('MetricsStore', () => {
  let client: Redis;
  let store: MetricsStore;

  beforeAll(async () => {
    client = new Redis(connection);
    store = new MetricsStore(client as unknown as RedisClient);
  }, 30_000);

  afterAll(async () => {
    await client.quit();
  }, 30_000);

  // A unique queue name per run: the buckets carry a 7-day TTL, so a fixed
  // name would read stale minutes from an earlier run.
  const queueName = `bullmq-dash-test-metrics-store-${randomUUID()}`;
  const minute = minuteIndex(Date.now());

  const bucketKey = (queue: string, minuteIndexValue: number, prefix: string = DEFAULT_METRICS_PREFIX) =>
    `${prefix}:${queue}:${minuteIndexValue}`;

  beforeEach(async () => {
    await client.del(bucketKey(queueName, minute), bucketKey(queueName, minute - 1));
  });

  it('defaults to the 7-day retention and namespaced prefix', () => {
    expect(DEFAULT_METRICS_RETENTION_SECONDS).toBe(7 * 24 * 60 * 60);
    expect(DEFAULT_METRICS_PREFIX).toBe('bullmq-dash:metrics');
  });

  it('accumulates deltas into the minute bucket', async () => {
    await store.incr(queueName, minute, { completed: 2, failed: 1 });
    await store.incr(queueName, minute, { completed: 3, durationSum: 250, durationCount: 1 });

    const bucket = await store.getBucket(queueName, minute);
    expect(bucket).toEqual({
      minute,
      completed: 5,
      failed: 1,
      durationSum: 250,
      durationCount: 1,
      waitSum: 0,
      waitCount: 0,
    });
  });

  it('keeps buckets separate per minute', async () => {
    await store.incr(queueName, minute, { completed: 1 });
    await store.incr(queueName, minute - 1, { completed: 2 });

    expect((await store.getBucket(queueName, minute)).completed).toBe(1);
    expect((await store.getBucket(queueName, minute - 1)).completed).toBe(2);
  });

  it('keeps buckets separate per queue', async () => {
    await store.incr('bullmq-dash-test-metrics-other', minute, { failed: 7 });

    const bucket = await store.getBucket(queueName, minute);
    expect(bucket.failed).toBe(0);
    expect(bucket.minute).toBe(minute);
  });

  it('answers zeros for a minute with no recorded events', async () => {
    const bucket = await store.getBucket(queueName, minute + 100);
    expect(bucket).toEqual({
      minute: minute + 100,
      completed: 0,
      failed: 0,
      durationSum: 0,
      durationCount: 0,
      waitSum: 0,
      waitCount: 0,
    });
  });

  it('expires buckets after the retention', async () => {
    const shortStore = new MetricsStore(client as unknown as RedisClient, { retentionSeconds: 1 });
    await shortStore.incr(queueName, minute, { completed: 1 });

    const key = bucketKey(queueName, minute);
    expect(await client.exists(key)).toBe(1);

    await pollUntil(async () => (await client.exists(key)) === 0, 5_000);

    const bucket = await store.getBucket(queueName, minute);
    expect(bucket.completed).toBe(0);
  }, 15_000);

  it('refreshes the bucket TTL on every write', async () => {
    const storeWithShortRetention = new MetricsStore(client as unknown as RedisClient, { retentionSeconds: 2 });
    await storeWithShortRetention.incr(queueName, minute, { completed: 1 });

    const key = bucketKey(queueName, minute);
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    await storeWithShortRetention.incr(queueName, minute, { completed: 1 });

    expect(await client.pttl(key)).toBeGreaterThan(1_000);
  }, 15_000);

  it('reads a sparse range of buckets in minute order', async () => {
    await store.incr(queueName, minute - 2, { completed: 4 });
    await store.incr(queueName, minute, { completed: 6 });

    const buckets = await store.getBuckets(queueName, minute - 4, minute);
    expect(buckets.map((bucket) => bucket.minute)).toEqual([minute - 2, minute]);
    expect(buckets.map((bucket) => bucket.completed)).toEqual([4, 6]);
  });

  it('returns nothing for a range with no buckets', async () => {
    const buckets = await store.getBuckets(queueName, minute + 500, minute + 520);
    expect(buckets).toEqual([]);
  });

  it('honors a custom key prefix', async () => {
    const prefixedStore = new MetricsStore(client as unknown as RedisClient, { prefix: 'acme:metrics' });
    await prefixedStore.incr(queueName, minute, { failed: 3 });

    const bucket = await prefixedStore.getBucket(queueName, minute);
    expect(bucket.failed).toBe(3);
    expect(await client.exists(bucketKey(queueName, minute, 'acme:metrics'))).toBe(1);
    expect(await client.exists(bucketKey(queueName, minute))).toBe(0);

    await client.del(bucketKey(queueName, minute, 'acme:metrics'));
  });

  it('expires buckets written with a custom retention', async () => {
    const storeWithRetention = new MetricsStore(client as unknown as RedisClient, { retentionSeconds: 1 });
    await storeWithRetention.incr(queueName, minute, { failed: 1 });
    expect(await client.pttl(bucketKey(queueName, minute))).toBeLessThanOrEqual(1_000);
  }, 15_000);

  it('writes through a BullMQ v6 adapted client (runCommand path)', async () => {
    // v6 exposes the proxied, script-registered client behind getBackend();
    // the store must register its Lua command on it before running.
    const adaptedQueueName = `bullmq-dash-test-metrics-adapted-${randomUUID()}`;
    const adaptedQueue = new Queue(adaptedQueueName, { connection });
    try {
      const backend = (
        adaptedQueue as unknown as {
          getBackend?: () => { client?: Promise<RedisClient> };
        }
      ).getBackend?.();
      const adapted = await backend?.client;
      expect(adapted).toBeTruthy();

      const adaptedStore = new MetricsStore(adapted);
      await adaptedStore.incr(adaptedQueueName, minute, { completed: 2, durationSum: 120, durationCount: 2 });

      const bucket = await adaptedStore.getBucket(adaptedQueueName, minute);
      expect(bucket.completed).toBe(2);
      expect(bucket.durationSum).toBe(120);

      const buckets = await adaptedStore.getBuckets(adaptedQueueName, minute, minute);
      expect(buckets.map((entry) => entry.completed)).toEqual([2]);
    } finally {
      await adaptedQueue.obliterate({ force: true });
      await adaptedQueue.close();
    }
  }, 20_000);
});



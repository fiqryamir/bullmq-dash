import { randomUUID } from 'node:crypto';
import { Queue, Worker, type RedisClient } from 'bullmq';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MetricsCapture } from '../metrics/capture';
import { registerMetricsStore } from '../metrics/registry';
import { MetricsStore, minuteIndex } from '../metrics/store';
import { BullMQAdapter } from '../queueAdapters/bullMQ';
import { TestQueueAdapter } from '../testUtils/TestQueueAdapter';
import { pollUntil } from '../testUtils/pollUntil';
import type { BullBoardQueues, BullBoardRequest, MetricsBucket } from '../typings/app';
import { metricsHandler } from './metrics';

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
};

type MetricsResponse = {
  status?: number | undefined;
  body: { queue: string; buckets: MetricsBucket[] };
};

const makeRequest = (queueName: string, queues: BullBoardQueues): BullBoardRequest => ({
  queues,
  uiConfig: {},
  query: {},
  params: { queueName },
  body: {},
  headers: {},
});

describe('metricsHandler routing', () => {
  it('reports an unregistered queue as not found', async () => {
    const queues: BullBoardQueues = new Map([['queue-a', new TestQueueAdapter('queue-a')]]);
    const response = await metricsHandler(makeRequest('missing', queues));
    expect(response.status).toBe(404);
  });

  it('hides queues behind a visibility guard', async () => {
    const hidden = new TestQueueAdapter('queue-a');
    hidden.setVisibilityGuard(() => false);
    const queues: BullBoardQueues = new Map([['queue-a', hidden]]);
    const response = await metricsHandler(makeRequest('queue-a', queues));
    expect(response.status).toBe(404);
  });

  it('clamps the served window to the store retention', async () => {
    const queueName = `bullmq-dash-test-metrics-clamp-${randomUUID()}`;
    const storeClient = new Redis(connection);
    try {
      const queues: BullBoardQueues = new Map([[queueName, new TestQueueAdapter(queueName)]]);
      registerMetricsStore(queues, new MetricsStore(storeClient as unknown as RedisClient, { retentionSeconds: 60 * 60 }));

      const now = Date.now();
      const response = await metricsHandler({
        ...makeRequest(queueName, queues),
        query: { from: String(now - 24 * 60 * 60 * 1000), to: String(now) },
      });
      const { body } = response as unknown as MetricsResponse;
      // An hour of minutes, not the full day the request asked for.
      expect(body.buckets.length).toBeLessThanOrEqual(61);
      expect(body.buckets.length).toBeGreaterThan(60);
    } finally {
      await storeClient.quit();
    }
  }, 30_000);

  it('rejects an inverted range with a 400', async () => {
    const queues: BullBoardQueues = new Map([['queue-a', new TestQueueAdapter('queue-a')]]);
    const now = Date.now();
    const response = await metricsHandler({
      ...makeRequest('queue-a', queues),
      query: { from: String(now), to: String(now - 60_000) },
    });
    expect(response.status).toBe(400);
  });

  it('serves a contiguous zeroed window for a queue without history', async () => {
    const queues: BullBoardQueues = new Map([['queue-a', new TestQueueAdapter('queue-a')]]);
    const now = minuteIndex(Date.now()) * 60_000;
    const response = await metricsHandler({
      ...makeRequest('queue-a', queues),
      query: { from: String(now - 10 * 60_000), to: String(now) },
    });
    const { body } = response as unknown as MetricsResponse;
    expect(body.queue).toBe('queue-a');
    expect(body.buckets).toHaveLength(11);
    expect(body.buckets[0]!.ts).toBe(now - 10 * 60_000);
    expect(body.buckets[10]!.ts).toBe(now);
    for (const bucket of body.buckets) {
      expect(bucket).toEqual({
        ts: bucket.ts,
        completed: 0,
        failed: 0,
        durationAvgMs: null,
        waitAvgMs: null,
      });
    }
  });

  it('serves empty buckets when no metrics store is registered', async () => {
    const queueName = `bullmq-dash-test-metrics-nostore-${randomUUID()}`;
    const queue = new Queue(queueName, { connection });
    try {
      const queues: BullBoardQueues = new Map([[queueName, new BullMQAdapter(queue)]]);
      const now = Date.now();
      const response = await metricsHandler({
        ...makeRequest(queueName, queues),
        query: { from: String(now - 60_000), to: String(now) },
      });
      const { body } = response as unknown as MetricsResponse;
      expect(body.buckets).toHaveLength(2);
      expect(body.buckets.every((bucket) => bucket.completed === 0)).toBe(true);
    } finally {
      await queue.obliterate({ force: true });
      await queue.close();
    }
  }, 30_000);
});

describe('metricsHandler native fallback', () => {
  const queueName = `bullmq-dash-test-metrics-native-${randomUUID()}`;
  let queue: Queue;
  let worker: Worker;
  let client: Redis;
  let request: BullBoardRequest;

  beforeAll(async () => {
    queue = new Queue(queueName, { connection });
    // Workers with native metrics keep counting while the dashboard is down;
    // no capture is attached anywhere in this block.
    worker = new Worker(
      queueName,
      async (job) => {
        if (job.name === 'boom') {
          throw new Error('boom');
        }
      },
      {
        connection,
        metrics: { maxDataPoints: 60 },
      }
    );
    await worker.waitUntilReady();

    client = new Redis(connection);
    const queues: BullBoardQueues = new Map([[queueName, new BullMQAdapter(queue)]]);
    request = makeRequest(queueName, queues);
  }, 30_000);

  afterAll(async () => {
    await worker.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await client.quit();
  }, 30_000);

  const send = async (query: Record<string, unknown> = {}): Promise<MetricsResponse> => {
    const response = await metricsHandler({ ...request, query });
    return { status: response.status, body: response.body as unknown as MetricsResponse['body'] };
  };

  it('serves counts completed while no capture was listening', async () => {
    await queue.add('one', {});
    await queue.add('two', {});
    await queue.add('boom', {});
    await new Promise((resolve) => setTimeout(resolve, 500));

    await pollUntil(async () => {
      const now = Date.now();
      const { body } = await send({ from: String(now - 60_000), to: String(now) });
      const total = body.buckets.reduce((sum, bucket) => sum + bucket.completed, 0);
      return total >= 2;
    }, 15_000);

    const now = Date.now();
    const { body } = await send({ from: String(now - 60_000), to: String(now) });
    const totals = body.buckets.reduce(
      (sum, bucket) => ({
        completed: sum.completed + bucket.completed,
        failed: sum.failed + bucket.failed,
      }),
      { completed: 0, failed: 0 }
    );
    expect(totals.completed).toBe(2);
    expect(totals.failed).toBe(1);
    // No capture ran, so no duration or wait samples exist.
    expect(body.buckets.every((bucket) => bucket.durationAvgMs === null)).toBe(true);
    expect(body.buckets.every((bucket) => bucket.waitAvgMs === null)).toBe(true);
  }, 20_000);
});

describe('metricsHandler event-derived aggregates', () => {
  const queueName = `bullmq-dash-test-metrics-events-${randomUUID()}`;
  let queue: Queue;
  let worker: Worker;
  let client: Redis;
  let store: MetricsStore;
  let capture: MetricsCapture;
  let request: BullBoardRequest;

  beforeAll(async () => {
    queue = new Queue(queueName, { connection });
    // No `metrics` option: everything this block asserts comes from the
    // QueueEvents capture, not the workers.
    worker = new Worker(
      queueName,
      async (job) => {
        if (job.name === 'boom') {
          throw new Error('boom');
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      },
      { connection }
    );
    await worker.waitUntilReady();

    client = new Redis(connection);
    store = new MetricsStore(client as unknown as RedisClient);
    capture = new MetricsCapture(store);
    await capture.addQueue(queueName, { queueName, client: client as unknown as RedisClient });

    const queues: BullBoardQueues = new Map([[queueName, new BullMQAdapter(queue)]]);
    registerMetricsStore(queues, store);
    request = makeRequest(queueName, queues);
  }, 30_000);

  afterAll(async () => {
    await capture.close();
    await worker.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await client.quit();
  }, 30_000);

  /**
   * Reads the last-minute window freshly each call, so a minute boundary
   * rolling over mid-test can never strand the poll outside the window.
   */
  const totals = async () => {
    const now = Date.now();
    const query = { from: String(now - 60_000), to: String(now) };
    const response = await metricsHandler({ ...request, query });
    const { buckets } = response.body as unknown as MetricsResponse['body'];
    return buckets.reduce(
      (sum, bucket) => ({
        completed: sum.completed + bucket.completed,
        failed: sum.failed + bucket.failed,
      }),
      { completed: 0, failed: 0 }
    );
  };

  it('serves the captured counts with duration and wait averages', async () => {
    // Warm the subscription, then measure deltas (see capture.spec for the
    // startup-window rationale).
    await queue.add('warmup', {});
    await pollUntil(async () => (await totals()).completed >= 1, 15_000);
    const before = await totals();

    await queue.add('ok', { i: 1 });
    await queue.add('ok', { i: 2 });
    await queue.add('boom', { i: 3 });

    await pollUntil(async () => {
      const current = await totals();
      return current.completed >= before.completed + 2 && current.failed >= before.failed + 1;
    }, 15_000);

    const current = await totals();
    expect(current.completed - before.completed).toBe(2);
    expect(current.failed - before.failed).toBe(1);

    // The minute that holds the work carries both averages; empty minutes
    // around it stay null.
    const now = Date.now();
    const response = await metricsHandler({
      ...request,
      query: { from: String(now - 60_000), to: String(now) },
    });
    const { buckets } = response.body as unknown as MetricsResponse['body'];
    const sampled = buckets.filter((bucket) => bucket.durationAvgMs !== null);
    expect(sampled.length).toBeGreaterThan(0);
    for (const bucket of sampled) {
      expect(bucket.durationAvgMs).toBeGreaterThanOrEqual(0);
      expect(bucket.waitAvgMs).toBeGreaterThanOrEqual(0);
    }
  }, 20_000);
});

describe('metricsHandler store and native merge', () => {
  const queueName = `bullmq-dash-test-metrics-merge-${randomUUID()}`;
  let queue: Queue;
  let worker: Worker;
  let client: Redis;
  let store: MetricsStore;
  let capture: MetricsCapture;
  let request: BullBoardRequest;

  beforeAll(async () => {
    queue = new Queue(queueName, { connection });
    worker = new Worker(queueName, async () => {}, {
      connection,
      metrics: { maxDataPoints: 60 },
    });
    await worker.waitUntilReady();

    client = new Redis(connection);
    store = new MetricsStore(client as unknown as RedisClient);
    capture = new MetricsCapture(store);
    await capture.addQueue(queueName, { queueName, client: client as unknown as RedisClient });

    const queues: BullBoardQueues = new Map([[queueName, new BullMQAdapter(queue)]]);
    registerMetricsStore(queues, store);
    request = makeRequest(queueName, queues);
  }, 30_000);

  afterAll(async () => {
    await capture.close();
    await worker.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await client.quit();
  }, 30_000);

  it('counts each completion once when both sources record it', async () => {
    const completedIn = async (): Promise<number> => {
      const now = Date.now();
      const response = await metricsHandler({
        ...request,
        query: { from: String(now - 60_000), to: String(now) },
      });
      const { buckets } = response.body as unknown as MetricsResponse['body'];
      return buckets.reduce((sum, bucket) => sum + bucket.completed, 0);
    };

    await queue.add('warmup', {});
    await pollUntil(async () => (await completedIn()) >= 1, 15_000);
    const before = await completedIn();

    await queue.add('both', {});
    await queue.add('both', {});

    await pollUntil(async () => (await completedIn()) >= before + 2, 15_000);

    expect((await completedIn()) - before).toBe(2);
  }, 20_000);
});





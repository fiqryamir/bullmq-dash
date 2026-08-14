import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BullMQAdapter } from '../queueAdapters/bullMQ';
import type { BullBoardQueues, BullBoardRequest, RedisStats } from '../typings/app';
import { redisStatsHandler } from './redisStats';

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
};

describe('redisStatsHandler', () => {
  const queueName = `bullmq-dash-test-redis-stats-${randomUUID()}`;
  let queue: Queue;
  let request: BullBoardRequest;

  beforeAll(async () => {
    queue = new Queue(queueName, { connection });

    const queues: BullBoardQueues = new Map();
    queues.set(queueName, new BullMQAdapter(queue));

    request = {
      queues,
      uiConfig: {},
      query: {},
      params: {},
      body: {},
      headers: {},
    };
  }, 30_000);

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
  }, 30_000);

  it('reports the Redis version, memory and clients from the first queue', async () => {
    const response = await redisStatsHandler(request);

    expect(response.status).toBeUndefined();
    const stats = response.body as unknown as RedisStats;
    expect(stats.backend).toBe('redis');
    expect(typeof stats.version).toBe('string');
    expect(stats.memory).toEqual(
      expect.objectContaining({
        used: expect.any(Number),
        peak: expect.any(Number),
      })
    );
    expect(stats.memory.used).toBeGreaterThan(0);
    expect(stats.clients).toEqual(
      expect.objectContaining({
        connected: expect.any(Number),
        blocked: expect.any(Number),
      })
    );
  });

  it('answers an empty body when no queue is registered', async () => {
    const response = await redisStatsHandler({ ...request, queues: new Map() });

    expect(response.body).toEqual({});
  });

  it('answers 403 when the board config hides the Redis details', async () => {
    const response = await redisStatsHandler({ ...request, uiConfig: { hideRedisDetails: true } });

    expect(response.status).toBe(403);
  });
});

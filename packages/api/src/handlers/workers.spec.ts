import { randomUUID } from 'node:crypto';
import { Queue, Worker } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BullMQAdapter } from '../queueAdapters/bullMQ';
import type { BullBoardQueues, BullBoardRequest } from '../typings/app';
import { queueWorkersHandler } from './workers';

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
};

describe('queueWorkersHandler', () => {
  const queueName = `bullmq-dash-test-workers-${randomUUID()}`;
  let queue: Queue;
  let worker: Worker;
  let request: BullBoardRequest;

  beforeAll(async () => {
    queue = new Queue(queueName, { connection });
    worker = new Worker(queueName, async () => 'result', { connection, name: 'mailer' });
    await worker.waitUntilReady();

    const queues: BullBoardQueues = new Map();
    queues.set(queueName, new BullMQAdapter(queue));

    request = {
      queues,
      uiConfig: {},
      query: {},
      params: { queueName },
      body: {},
      headers: {},
    };
  }, 30_000);

  afterAll(async () => {
    await worker.close();
    await queue.obliterate({ force: true });
    await queue.close();
  }, 30_000);

  it('lists the connected workers of a queue', async () => {
    const response = await queueWorkersHandler(request);

    expect(response.status).toBe(200);
    const body = response.body as { workers: Array<{ name: string | null; addr: string; age: number }> };
    expect(body.workers).not.toBeNull();
    expect(body.workers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'mailer', addr: expect.any(String), age: expect.any(Number) }),
      ])
    );
  });

  it('answers an empty list when no worker is connected', async () => {
    const idleName = `bullmq-dash-test-workers-idle-${randomUUID()}`;
    const idleQueue = new Queue(idleName, { connection });
    const queues: BullBoardQueues = new Map();
    queues.set(idleName, new BullMQAdapter(idleQueue));

    const response = await queueWorkersHandler({ ...request, queues, params: { queueName: idleName } });

    expect(response.status).toBe(200);
    expect((response.body as { workers: unknown[] }).workers).toEqual([]);

    await idleQueue.obliterate({ force: true });
    await idleQueue.close();
  }, 30_000);

  it('answers 404 for an unknown queue', async () => {
    const response = await queueWorkersHandler({ ...request, params: { queueName: 'not-a-queue' } });

    expect(response.status).toBe(404);
  });

  it('answers 403 when the board config disables the workers view', async () => {
    const response = await queueWorkersHandler({ ...request, uiConfig: { showWorkers: false } });

    expect(response.status).toBe(403);
  });
});

import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BullMQAdapter } from '../queueAdapters/bullMQ';
import type { AppJobScheduler, BullBoardQueues, BullBoardRequest } from '../typings/app';
import {
  addJobSchedulerHandler,
  removeJobSchedulerHandler,
  updateJobSchedulerHandler,
} from './jobSchedulerActions';

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
};

describe('job scheduler action handlers', () => {
  const queueName = `bullmq-dash-test-scheduler-actions-${randomUUID()}`;
  let queue: Queue;
  let request: BullBoardRequest;

  const schedulers = async (): Promise<AppJobScheduler[]> => {
    const raw = await queue.getJobSchedulers(0, -1);
    return raw.map((scheduler) => ({
      id: scheduler.key,
      name: scheduler.name,
      ...(scheduler.pattern !== undefined ? { pattern: scheduler.pattern } : {}),
      ...(scheduler.every !== undefined ? { every: scheduler.every } : {}),
      ...(scheduler.tz !== undefined ? { tz: scheduler.tz } : {}),
      ...(scheduler.limit !== undefined ? { limit: scheduler.limit } : {}),
      ...(scheduler.endDate !== undefined ? { endDate: scheduler.endDate } : {}),
      ...(scheduler.iterationCount !== undefined
        ? { iterationCount: scheduler.iterationCount }
        : {}),
      ...(scheduler.template !== undefined
        ? { template: scheduler.template as Record<string, unknown> }
        : {}),
    }));
  };

  beforeAll(async () => {
    queue = new Queue(queueName, { connection });

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
    await queue.obliterate({ force: true });
    await queue.close();
  }, 30_000);

  describe('addJobSchedulerHandler', () => {
    it('registers a repeatable job from an every schedule', async () => {
      const response = await addJobSchedulerHandler({
        ...request,
        body: {
          id: 'created-every',
          repeat: { every: 60_000 },
          jobTemplate: { name: 'heartbeat', data: { beat: true } },
        },
      });

      expect(response.status).toBe(201);
      const body = response.body as { scheduler: AppJobScheduler };
      expect(body.scheduler).toMatchObject({ id: 'created-every', name: 'heartbeat' });

      const [stored] = await schedulers();
      expect(stored).toMatchObject({
        id: 'created-every',
        name: 'heartbeat',
        every: 60_000,
        iterationCount: 1,
      });
    });

    it('registers a cron schedule', async () => {
      const response = await addJobSchedulerHandler({
        ...request,
        body: {
          id: 'created-cron',
          repeat: { pattern: '*/5 * * * *', tz: 'UTC' },
          jobTemplate: { name: 'cron-job' },
        },
      });

      expect(response.status).toBe(201);
      const body = response.body as { scheduler: AppJobScheduler };
      expect(body.scheduler).toMatchObject({ id: 'created-cron', name: 'cron-job', pattern: '*/5 * * * *' });
    });

    it('rejects a body with neither pattern nor every', async () => {
      const response = await addJobSchedulerHandler({
        ...request,
        body: { id: 'bad', repeat: {} },
      });

      expect(response.status).toBe(400);
    });

    it('rejects a body with both pattern and every', async () => {
      const response = await addJobSchedulerHandler({
        ...request,
        body: { id: 'bad', repeat: { pattern: '* * * * *', every: 1000 } },
      });

      expect(response.status).toBe(400);
    });

    it('rejects a missing or empty id', async () => {
      const missing = await addJobSchedulerHandler({
        ...request,
        body: { repeat: { every: 1000 } },
      });
      expect(missing.status).toBe(400);

      const empty = await addJobSchedulerHandler({
        ...request,
        body: { id: '  ', repeat: { every: 1000 } },
      });
      expect(empty.status).toBe(400);
    });

    it('rejects a non-positive every and a malformed pattern', async () => {
      const nonPositive = await addJobSchedulerHandler({
        ...request,
        body: { id: 'bad', repeat: { every: -5 } },
      });
      expect(nonPositive.status).toBe(400);

      const malformed = await addJobSchedulerHandler({
        ...request,
        body: { id: 'bad', repeat: { pattern: 'not a cron' } },
      });
      expect(malformed.status).toBe(400);
    });

    it('rejects a limit that is not a positive integer and an end date in the past', async () => {
      const limit = await addJobSchedulerHandler({
        ...request,
        body: { id: 'bad', repeat: { every: 1000, limit: 1.5 } },
      });
      expect(limit.status).toBe(400);

      const endDate = await addJobSchedulerHandler({
        ...request,
        body: { id: 'bad', repeat: { every: 1000, endDate: Date.now() - 60_000 } },
      });
      expect(endDate.status).toBe(400);
    });

    it('answers 404 for an unknown queue', async () => {
      const response = await addJobSchedulerHandler({
        ...request,
        params: { queueName: 'not-a-queue' },
        body: { id: 'x', repeat: { every: 1000 } },
      });

      expect(response.status).toBe(404);
    });

    it('answers 403 on a read-only queue', async () => {
      const readOnlyName = `bullmq-dash-test-scheduler-actions-ro-${randomUUID()}`;
      const readOnlyQueue = new Queue(readOnlyName, { connection });
      const queues: BullBoardQueues = new Map();
      queues.set(readOnlyName, new BullMQAdapter(readOnlyQueue, { readOnlyMode: true }));

      const response = await addJobSchedulerHandler({
        ...request,
        queues,
        params: { queueName: readOnlyName },
        body: { id: 'x', repeat: { every: 1000 } },
      });

      expect(response.status).toBe(403);

      await readOnlyQueue.obliterate({ force: true });
      await readOnlyQueue.close();
    }, 30_000);
  });

  describe('updateJobSchedulerHandler', () => {
    beforeAll(async () => {
      await queue.upsertJobScheduler('to-update', { every: 60_000 }, { name: 'updatable' });
    }, 30_000);

    it('rewrites the schedule of an existing scheduler', async () => {
      const response = await updateJobSchedulerHandler({
        ...request,
        params: { queueName, schedulerId: 'to-update' },
        body: { every: 120_000, limit: 10 },
      });

      expect(response.status).toBe(204);

      const stored = (await schedulers()).find((scheduler) => scheduler.id === 'to-update');
      expect(stored).toMatchObject({ id: 'to-update', every: 120_000, limit: 10, name: 'updatable' });
    });

    it('answers 404 for an unknown scheduler', async () => {
      const response = await updateJobSchedulerHandler({
        ...request,
        params: { queueName, schedulerId: 'missing' },
        body: { every: 1000 },
      });

      expect(response.status).toBe(404);
    });

    it('rejects an invalid schedule with a 400', async () => {
      const response = await updateJobSchedulerHandler({
        ...request,
        params: { queueName, schedulerId: 'to-update' },
        body: {},
      });

      expect(response.status).toBe(400);
    });

    it('rejects a malformed cron pattern without touching the stored scheduler', async () => {
      const response = await updateJobSchedulerHandler({
        ...request,
        params: { queueName, schedulerId: 'to-update' },
        body: { pattern: 'not a cron' },
      });

      expect(response.status).toBe(400);

      const stored = (await schedulers()).find((scheduler) => scheduler.id === 'to-update');
      expect(stored?.every).toBe(120_000);
    });

    it('answers 404 for an unknown queue', async () => {
      const response = await updateJobSchedulerHandler({
        ...request,
        params: { queueName: 'not-a-queue', schedulerId: 'to-update' },
        body: { every: 1000 },
      });

      expect(response.status).toBe(404);
    });

    it('answers 403 on a read-only board', async () => {
      const response = await updateJobSchedulerHandler({
        ...request,
        uiConfig: { readOnly: true },
        params: { queueName, schedulerId: 'to-update' },
        body: { every: 1000 },
      });

      expect(response.status).toBe(403);
    });
  });

  describe('removeJobSchedulerHandler', () => {
    beforeAll(async () => {
      await queue.upsertJobScheduler('to-remove', { every: 60_000 }, { name: 'removable' });
    }, 30_000);

    it('removes an existing scheduler', async () => {
      const response = await removeJobSchedulerHandler({
        ...request,
        params: { queueName, schedulerId: 'to-remove' },
      });

      expect(response.status).toBe(204);
      expect(await queue.getJobScheduler('to-remove')).toBeUndefined();
    });

    it('answers 404 for an unknown scheduler', async () => {
      const response = await removeJobSchedulerHandler({
        ...request,
        params: { queueName, schedulerId: 'missing' },
      });

      expect(response.status).toBe(404);
    });

    it('answers 403 on a read-only queue', async () => {
      const readOnlyName = `bullmq-dash-test-scheduler-actions-ro2-${randomUUID()}`;
      const readOnlyQueue = new Queue(readOnlyName, { connection });
      await readOnlyQueue.upsertJobScheduler('kept', { every: 60_000 }, { name: 'kept' });
      const queues: BullBoardQueues = new Map();
      queues.set(readOnlyName, new BullMQAdapter(readOnlyQueue, { readOnlyMode: true }));

      const response = await removeJobSchedulerHandler({
        ...request,
        queues,
        params: { queueName: readOnlyName, schedulerId: 'kept' },
      });

      expect(response.status).toBe(403);
      expect(await readOnlyQueue.getJobScheduler('kept')).toBeDefined();

      await readOnlyQueue.obliterate({ force: true });
      await readOnlyQueue.close();
    }, 30_000);
  });
});

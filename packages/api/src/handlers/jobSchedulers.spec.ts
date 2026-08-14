import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BullMQAdapter } from '../queueAdapters/bullMQ';
import type {
  AppJobScheduler,
  BullBoardQueues,
  BullBoardRequest,
  ControllerHandlerReturnType,
} from '../typings/app';
import { jobSchedulersHandler } from './jobSchedulers';

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
};

describe('jobSchedulersHandler', () => {
  const queueName = `bullmq-dash-test-schedulers-${randomUUID()}`;
  const secondQueueName = `bullmq-dash-test-schedulers-2-${randomUUID()}`;
  let queue: Queue;
  let secondQueue: Queue;
  let request: BullBoardRequest;

  beforeAll(async () => {
    queue = new Queue(queueName, { connection });
    secondQueue = new Queue(secondQueueName, { connection });

    await queue.upsertJobScheduler('daily-summary', { every: 86_400_000 }, { name: 'summary' });
    await queue.upsertJobScheduler(
      'hourly-sync',
      { pattern: '0 * * * *' },
      { name: 'sync', data: { bucket: 'main' } }
    );
    await secondQueue.upsertJobScheduler('weekly-report', { every: 604_800_000 }, { name: 'report' });

    const queues: BullBoardQueues = new Map();
    queues.set(queueName, new BullMQAdapter(queue));
    queues.set(secondQueueName, new BullMQAdapter(secondQueue));

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
    await secondQueue.obliterate({ force: true });
    await queue.close();
    await secondQueue.close();
  }, 30_000);

  const send = async (
    query: Record<string, unknown> = {}
  ): Promise<{ status?: number | undefined; body: { schedulers: AppJobScheduler[] } }> => {
    const response: ControllerHandlerReturnType = await jobSchedulersHandler({ ...request, query });
    return {
      status: response.status,
      body: response.body as { schedulers: AppJobScheduler[] },
    };
  };

  it('lists every scheduler across all queues with their queue names', async () => {
    const { body } = await send();

    expect(body.schedulers).toHaveLength(3);
    expect(body.schedulers.map((scheduler) => scheduler.id).sort()).toEqual([
      'daily-summary',
      'hourly-sync',
      'weekly-report',
    ]);
    const hourly = body.schedulers.find((scheduler) => scheduler.id === 'hourly-sync');
    expect(hourly).toMatchObject({
      queueName,
      name: 'sync',
      pattern: '0 * * * *',
      iterationCount: expect.any(Number),
    });
    expect(hourly?.template).toMatchObject({ data: { bucket: 'main' } });
  });

  it('filters to one queue when the queueName query is given', async () => {
    const { body } = await send({ queueName: secondQueueName });

    expect(body.schedulers).toHaveLength(1);
    expect(body.schedulers[0]).toMatchObject({ id: 'weekly-report', queueName: secondQueueName });
  });

  it('answers an empty list when no schedulers exist for the scope', async () => {
    const { body } = await send({ queueName: 'no-such-queue' });

    expect(body.schedulers).toEqual([]);
  });

  it('never lists schedulers of hidden queues', async () => {
    const hiddenName = `bullmq-dash-test-schedulers-hidden-${randomUUID()}`;
    const hiddenQueue = new Queue(hiddenName, { connection });
    await hiddenQueue.upsertJobScheduler('secret', { every: 60_000 }, { name: 'secret-job' });
    const hiddenAdapter = new BullMQAdapter(hiddenQueue);
    hiddenAdapter.setVisibilityGuard(() => false);

    const queues: BullBoardQueues = new Map();
    queues.set(hiddenName, hiddenAdapter);
    const response = await jobSchedulersHandler({ ...request, queues });

    const body = response.body as { schedulers: AppJobScheduler[] };
    expect(body.schedulers).toEqual([]);

    await hiddenQueue.obliterate({ force: true });
    await hiddenQueue.close();
  }, 30_000);
});

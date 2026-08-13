import { randomUUID } from 'node:crypto';
import { Queue, Worker } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BullMQAdapter } from '../queueAdapters/bullMQ';
import { pollUntil } from '../testUtils/pollUntil';
import type { BullBoardQueues, BullBoardRequest, ControllerHandlerReturnType } from '../typings/app';
import {
  cleanAllHandler,
  emptyQueueHandler,
  pauseQueueHandler,
  promoteAllHandler,
  removeAllHandler,
  resumeQueueHandler,
  retryAllHandler,
} from './queueActions';

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
};

describe('queue action handlers', () => {
  const queueName = `bullmq-dash-test-queue-actions-${randomUUID()}`;
  let queue: Queue;
  let request: BullBoardRequest;

  beforeAll(async () => {
    queue = new Queue(queueName, { connection });

    const worker = new Worker(
      queueName,
      async (job) => {
        if (job.name === 'fail-me') {
          throw new Error('boom');
        }
        return 'result';
      },
      { connection }
    );

    await queue.add('fail-me', { index: 1 });
    await queue.add('fail-me', { index: 2 });
    const completedJob = await queue.add('done', { index: 3 });

    await pollUntil(async () => (await completedJob.isCompleted()), 10_000);
    await worker.close();

    await queue.add('later', { index: 4 }, { delay: 60_000 });
    await queue.add('wait', { index: 5 });
    await queue.add('wait', { index: 6 });

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

  const send = async (
    handler: (req: BullBoardRequest) => Promise<ControllerHandlerReturnType>,
    params: Record<string, unknown> = {},
    query: Record<string, unknown> = {}
  ): Promise<ControllerHandlerReturnType> => {
    return handler({ ...request, params: { ...request.params, ...params }, query });
  };

  it('retries every failed job and reports the retried and skipped counts', async () => {
    const response = await send(retryAllHandler, { queueStatus: 'failed' });

    expect(response.status).toBeUndefined();
    expect(response.body).toEqual({ retried: 2, skipped: 0 });
    expect(await queue.getJobCountByTypes('failed')).toBe(0);
    expect(await queue.getJobCountByTypes('waiting')).toBe(4);
  });

  it('retries every completed job', async () => {
    const response = await send(retryAllHandler, { queueStatus: 'completed' });

    expect(response.body).toEqual({ retried: 1, skipped: 0 });
    expect(await queue.getJobCountByTypes('completed')).toBe(0);
    expect(await queue.getJobCountByTypes('waiting')).toBe(5);
  });

  it('rejects a non-retriable status', async () => {
    const response = await send(retryAllHandler, { queueStatus: 'delayed' });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid retry status' });
  });

  it('promotes every delayed job', async () => {
    const response = await send(promoteAllHandler);

    expect(response.status).toBeUndefined();
    expect(response.body).toEqual({});
    expect(await queue.getJobCountByTypes('delayed')).toBe(0);
    expect(await queue.getJobCountByTypes('waiting')).toBe(6);
  });

  it('cleans the completed and failed jobs older than the grace period', async () => {
    const worker = new Worker(
      queueName,
      async (job) => {
        if (job.name === 'fail-me') {
          throw new Error('boom');
        }
        return 'result';
      },
      { connection }
    );

    const failed = await queue.add('fail-me', { index: 7 });
    await pollUntil(async () => (await failed.isFailed()), 10_000);
    await worker.close();

    const completed = await send(cleanAllHandler, { queueStatus: 'completed' }, { grace: '0' });
    expect(completed.status).toBeUndefined();
    expect(completed.body).toEqual({});
    expect(await queue.getJobCountByTypes('completed')).toBe(0);

    const failedResponse = await send(cleanAllHandler, { queueStatus: 'failed' }, { grace: '0' });
    expect(failedResponse.status).toBeUndefined();
    expect(await queue.getJobCountByTypes('failed')).toBe(0);
  });

  it('defaults the clean grace period to 5 seconds', async () => {
    const response = await send(cleanAllHandler, { queueStatus: 'waiting' });
    expect(response.status).toBeUndefined();
  });

  it('rejects a negative or malformed clean grace period', async () => {
    for (const grace of ['-1', 'soon']) {
      const response = await send(cleanAllHandler, { queueStatus: 'completed' }, { grace });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid grace period' });
    }
  });

  it('rejects cleaning an unsupported status', async () => {
    const response = await send(cleanAllHandler, { queueStatus: 'waiting-children' });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid clean status' });
  });

  it('removes every job in a state and reports the count', async () => {
    await queue.add('wait', { index: 8 });

    const response = await send(removeAllHandler, { queueStatus: 'waiting' });

    expect(response.status).toBeUndefined();
    expect(response.body).toEqual({ removed: 1 });
    expect(await queue.getJobCountByTypes('waiting')).toBe(0);
  });

  it('removes the paused jobs while the queue is paused', async () => {
    await queue.pause();
    await queue.add('pause-me', { index: 11 });
    const response = await send(removeAllHandler, { queueStatus: 'paused' });
    await queue.resume();

    expect(response.body).toEqual({ removed: 1 });
    expect(await queue.getJobCountByTypes('waiting')).toBe(0);
  });

  it('rejects removing an unknown status', async () => {
    const response = await send(removeAllHandler, { queueStatus: 'nonsense' });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid status' });
  });

  it('pauses and resumes the queue', async () => {
    await queue.resume();
    expect(await queue.isPaused()).toBe(false);

    const paused = await send(pauseQueueHandler);
    expect(paused.status).toBeUndefined();
    expect(await queue.isPaused()).toBe(true);

    const resumed = await send(resumeQueueHandler);
    expect(resumed.status).toBeUndefined();
    expect(await queue.isPaused()).toBe(false);
  });

  it('empties the waiting jobs, keeping the delayed ones', async () => {
    await queue.add('wait', { index: 9 });
    await queue.add('later', { index: 10 }, { delay: 60_000 });

    const response = await send(emptyQueueHandler);

    expect(response.status).toBeUndefined();
    expect(response.body).toEqual({});
    expect(await queue.getJobCountByTypes('waiting')).toBe(0);
    expect(await queue.getJobCountByTypes('delayed')).toBe(1);
  });

  it('reports an unregistered queue as not found', async () => {
    const response = await retryAllHandler({
      ...request,
      params: { queueName: 'not-a-queue' },
    });
    expect(response.status).toBe(404);
  });

  it('blocks every mutation while the board is read-only', async () => {
    const readOnlyRequest = { ...request, uiConfig: { readOnly: true } };

    const handlers = [
      retryAllHandler,
      promoteAllHandler,
      cleanAllHandler,
      removeAllHandler,
      pauseQueueHandler,
      resumeQueueHandler,
      emptyQueueHandler,
    ];

    for (const handler of handlers) {
      const response = await handler(readOnlyRequest);
      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'readOnly mode is enabled' });
    }
  });

  it('blocks mutations for a queue registered in read-only mode', async () => {
    const readOnlyAdapter = new BullMQAdapter(queue, { readOnlyMode: true });
    request.queues.set(queueName, readOnlyAdapter);

    const response = await send(pauseQueueHandler);
    expect(response.status).toBe(403);

    request.queues.set(queueName, new BullMQAdapter(queue));
  });
});


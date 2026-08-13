import { randomUUID } from 'node:crypto';
import { Queue, Worker } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BullMQAdapter } from '../queueAdapters/bullMQ';
import { pollUntil } from '../testUtils/pollUntil';
import type {
  BullBoardQueues,
  BullBoardRequest,
  ControllerHandlerReturnType,
} from '../typings/app';
import { promoteJobHandler, removeJobHandler, retryJobHandler } from './jobActions';

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
};

describe('job action handlers', () => {
  const queueName = `bullmq-dash-test-job-actions-${randomUUID()}`;
  let queue: Queue;
  let request: BullBoardRequest;
  let failedJobId: string;
  let completedJobId: string;
  let delayedJobId: string;
  let waitingJobId: string;

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

    const failedJob = await queue.add('fail-me', { index: 1 });
    const completedJob = await queue.add('done', { index: 2 });

    await pollUntil(
      async () => (await failedJob.isFailed()) && (await completedJob.isCompleted()),
      10_000
    );
    await worker.close();

    failedJobId = failedJob.id!;
    completedJobId = completedJob.id!;

    const delayedJob = await queue.add('later', { index: 3 }, { delay: 60_000 });
    const waitingJob = await queue.add('wait', { index: 4 });
    delayedJobId = delayedJob.id!;
    waitingJobId = waitingJob.id!;

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
    jobId: string
  ) => {
    return handler({ ...request, params: { queueName, jobId } });
  };

  it('retries a failed job', async () => {
    const response = await send(retryJobHandler, failedJobId);

    expect(response.status).toBe(204);
    expect(await (await queue.getJob(failedJobId))?.getState()).toBe('waiting');
  });

  it('retries a completed job', async () => {
    const response = await send(retryJobHandler, completedJobId);

    expect(response.status).toBe(204);
    expect(await (await queue.getJob(completedJobId))?.getState()).toBe('waiting');
  });

  it('rejects retrying a job that is neither failed nor completed', async () => {
    const response = await send(retryJobHandler, delayedJobId);
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Job is not retriable' });
  });

  it('promotes a delayed job', async () => {
    const response = await send(promoteJobHandler, delayedJobId);

    expect(response.status).toBe(204);
    expect(await (await queue.getJob(delayedJobId))?.getState()).toBe('waiting');
  });

  it('removes a job', async () => {
    const response = await send(removeJobHandler, waitingJobId);

    expect(response.status).toBe(204);
    expect(await queue.getJob(waitingJobId)).toBeUndefined();
  });

  it('answers a 409 when removing a job a worker is holding', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const worker = new Worker(
      queueName,
      async (job) => {
        if (job.name === 'hold-me') {
          await gate;
          return 'released';
        }
        throw new Error('boom');
      },
      { connection, concurrency: 5 }
    );

    const held = await queue.add('hold-me', { index: 9 });
    await pollUntil(async () => (await held.getState()) === 'active', 10_000);

    const response = await send(removeJobHandler, held.id!);
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'Job is active' });

    release();
    await worker.close();
  });

  it('reports an unknown job as not found', async () => {
    const response = await send(retryJobHandler, 'does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Job not found' });
  });

  it('reports an unregistered queue as not found', async () => {
    const response = await retryJobHandler({
      ...request,
      params: { queueName: 'not-a-queue', jobId: failedJobId },
    });
    expect(response.status).toBe(404);
  });

  it('blocks every mutation while the board is read-only', async () => {
    const readOnlyRequest = { ...request, uiConfig: { readOnly: true } };

    for (const handler of [retryJobHandler, promoteJobHandler, removeJobHandler]) {
      const response = await handler({
        ...readOnlyRequest,
        params: { queueName, jobId: failedJobId },
      });
      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'readOnly mode is enabled' });
    }
  });

  it('blocks mutations for a queue registered in read-only mode', async () => {
    const readOnlyAdapter = new BullMQAdapter(queue, { readOnlyMode: true });
    request.queues.set(queueName, readOnlyAdapter);

    const response = await send(retryJobHandler, failedJobId);
    expect(response.status).toBe(403);

    request.queues.set(queueName, new BullMQAdapter(queue));
  });
});

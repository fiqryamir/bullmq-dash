import { randomUUID } from 'node:crypto';
import { Queue, Worker } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BullMQAdapter } from '../queueAdapters/bullMQ';
import type {
  BullBoardQueues,
  BullBoardRequest,
  JobDetailResponse,
  JobStatus,
} from '../typings/app';
import { jobHandler } from './job';

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
};

async function waitForState(
  queue: Queue,
  jobId: string,
  expected: string,
  timeoutMs = 15_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await queue.getJobState(jobId);
    if (state === expected) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`job ${jobId} never reached state ${expected}`);
}

describe('jobHandler', () => {
  const queueName = `bullmq-dash-test-job-${randomUUID()}`;
  let queue: Queue;
  let worker: Worker;
  let failingJobId: string;
  let happyJobId: string;
  let request: BullBoardRequest;

  beforeAll(async () => {
    queue = new Queue(queueName, { connection });
    worker = new Worker(
      queueName,
      async (job) => {
        if (job.name === 'failing-job') {
          await job.updateProgress(20);
          throw new Error('kaboom');
        }
        await job.updateProgress(42);
        return { delivered: true };
      },
      { connection }
    );

    const failing = await queue.add(
      'failing-job',
      { email: 'ops@example.com' },
      { attempts: 2, backoff: 100, priority: 3 }
    );
    const happy = await queue.add('happy-job', { payload: { ok: true } }, { removeOnComplete: false });

    failingJobId = failing.id!;
    happyJobId = happy.id!;
    await waitForState(queue, failingJobId, 'failed');
    await waitForState(queue, happyJobId, 'completed');

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

  const send = async (
    params: Record<string, unknown>
  ): Promise<{ status?: number | undefined; body: JobDetailResponse & { error?: string } }> => {
    const response = await jobHandler({ ...request, params });
    return {
      status: response.status,
      body: response.body as unknown as JobDetailResponse & { error?: string },
    };
  };

  it('returns the failed job with its data, options, progress, attempts and stacktrace', async () => {
    const { status, body } = await send({ queueName, jobId: failingJobId });

    expect(status).toBeUndefined();
    expect(body.status).toBe('failed');
    expect(body.error).toBeUndefined();
    expect(body.job.id).toBe(failingJobId);
    expect(body.job.name).toBe('failing-job');
    expect(body.job.data).toEqual({ email: 'ops@example.com' });
    expect(body.job.opts).toMatchObject({
      attempts: 2,
      backoff: { type: 'fixed', delay: 100 },
      priority: 3,
    });
    expect(body.job.progress).toBe(20);
    expect(body.job.attempts).toBe(2);
    expect(body.job.failedReason).toBe('kaboom');
    expect(body.job.isFailed).toBe(true);
    expect(body.job.stacktrace).toHaveLength(2);
    for (const entry of body.job.stacktrace) {
      expect(entry).toContain('kaboom');
    }
  });

  it('returns the completed job with its return value and progress', async () => {
    const { status, body } = await send({ queueName, jobId: happyJobId });

    expect(status).toBeUndefined();
    expect(body.status).toBe('completed');
    expect(body.job.id).toBe(happyJobId);
    expect(body.job.progress).toBe(42);
    expect(body.job.returnValue).toEqual({ delivered: true });
    expect(body.job.isFailed).toBe(false);
    expect(body.job.stacktrace).toEqual([]);
    expect(body.job.failedReason).toBeUndefined();
  });

  it('carries the processing timestamps of a worked job', async () => {
    const { body } = await send({ queueName, jobId: failingJobId });

    expect(body.job.timestamp).toBeTypeOf('number');
    expect(body.job.processedOn).toBeTypeOf('number');
    expect(body.job.finishedOn).toBeTypeOf('number');
  });

  it('reports an unregistered queue as not found', async () => {
    const { status, body } = await send({ queueName: 'not-a-queue', jobId: failingJobId });
    expect(status).toBe(404);
    expect(body.error).toBeTruthy();
  });

  it('reports an unknown job as not found', async () => {
    const { status, body } = await send({ queueName, jobId: randomUUID() });
    expect(status).toBe(404);
    expect(body.error).toBeTruthy();
  });

  it('hides queues behind a visibility guard', async () => {
    const hidden = new BullMQAdapter(queue);
    hidden.setVisibilityGuard(() => false);
    request.queues.set(queueName, hidden);

    const { status } = await send({ queueName, jobId: failingJobId });
    expect(status).toBe(404);

    request.queues.set(queueName, new BullMQAdapter(queue));
  });

  it('reports the live state of a job the handler did not see processed', async () => {
    const { body } = await send({ queueName, jobId: failingJobId });
    expect(body.status satisfies JobStatus | 'unknown').toBe('failed');
  });
});

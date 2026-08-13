import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BullMQAdapter } from '../queueAdapters/bullMQ';
import type { AppJob, BullBoardQueues, BullBoardRequest, QueueJobsResponse } from '../typings/app';
import { queueJobsHandler } from './queueJobs';

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
};

describe('queueJobsHandler', () => {
  const queueName = `bullmq-dash-test-jobs-${randomUUID()}`;
  let queue: Queue;
  let request: BullBoardRequest;

  beforeAll(async () => {
    queue = new Queue(queueName, { connection });

    for (let index = 0; index < 5; index += 1) {
      await queue.add('mail-job', { index });
    }
    await queue.add('later-job', { index: 5 }, { delay: 60_000 });

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
    query: Record<string, unknown> = {}
  ): Promise<{ status?: number | undefined; body: QueueJobsResponse & { error?: string } }> => {
    const response = await queueJobsHandler({ ...request, query });
    return {
      status: response.status,
      body: response.body as unknown as QueueJobsResponse & { error?: string },
    };
  };

  it('returns the first page of jobs for a state with its pagination', async () => {
    const { status, body } = await send({ status: 'waiting', page: '1', jobsPerPage: '2' });

    expect(status).toBeUndefined();
    expect(body.jobs).toHaveLength(2);
    expect(body.jobs.map((job) => job.name)).toEqual(['mail-job', 'mail-job']);
    expect(body.jobs[0]).toMatchObject({
      id: expect.any(String),
      name: 'mail-job',
      state: 'waiting',
      progress: 0,
      attempts: 0,
    });
    expect(body.pagination).toEqual({ pageCount: 3, range: { start: 0, end: 1 } });
  });

  it('honors the page offset', async () => {
    const { body } = await send({ status: 'waiting', page: '2', jobsPerPage: '2' });

    expect(body.jobs).toHaveLength(2);
    expect(body.pagination).toEqual({ pageCount: 3, range: { start: 2, end: 3 } });
    expect(body.jobs[0]?.id).not.toBeUndefined();
  });

  it('serves the last, possibly short page', async () => {
    const { body } = await send({ status: 'waiting', page: '3', jobsPerPage: '2' });

    expect(body.jobs).toHaveLength(1);
    expect(body.pagination).toEqual({ pageCount: 3, range: { start: 4, end: 5 } });
  });

  it('pages every state the switcher offers', async () => {
    const { body: delayed } = await send({ status: 'delayed' });
    expect(delayed.jobs.map((job) => job.state)).toEqual(['delayed']);
    expect(delayed.jobs.map((job) => job.name)).toEqual(['later-job']);

    const { body: completed } = await send({ status: 'completed' });
    expect(completed.jobs).toEqual([]);
    expect(completed.pagination).toEqual({ pageCount: 0, range: { start: 0, end: 9 } });
  });

  it('returns an empty list with no pages for an empty state', async () => {
    const { body } = await send({ status: 'failed' });

    expect(body.jobs).toEqual([]);
    expect(body.pagination).toEqual({ pageCount: 0, range: { start: 0, end: 9 } });
  });

  it('lists the waiting jobs under the paused state while the queue is paused', async () => {
    await queue.pause();
    const { body } = await send({ status: 'paused', jobsPerPage: '10' });
    await queue.resume();

    expect(body.jobs.map((job: AppJob) => job.name)).toEqual(
      ['mail-job', 'mail-job', 'mail-job', 'mail-job', 'mail-job']
    );
    expect(body.jobs.map((job: AppJob) => job.state)).toEqual([
      'paused',
      'paused',
      'paused',
      'paused',
      'paused',
    ]);
    expect(body.pagination).toEqual({ pageCount: 1, range: { start: 0, end: 9 } });
  });

  it('reports a missing state as a bad request', async () => {
    const { status, body } = await send({});
    expect(status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  it('reports an unknown state as a bad request', async () => {
    const { status, body } = await send({ status: 'nonsense' });
    expect(status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  it('clamps nonsensical page and page-size values', async () => {
    const { status, body } = await send({ status: 'waiting', page: '-3', jobsPerPage: '0' });
    expect(status).toBeUndefined();
    expect(body.jobs).toHaveLength(1);
    expect(body.pagination).toEqual({ pageCount: 5, range: { start: 0, end: 0 } });
  });

  it('reports an unregistered queue as not found', async () => {
    const response = await queueJobsHandler({
      ...request,
      params: { queueName: 'not-a-queue' },
      query: { status: 'waiting' },
    });
    expect(response.status).toBe(404);
  });

  it('hides queues behind a visibility guard', async () => {
    const hidden = new BullMQAdapter(queue);
    hidden.setVisibilityGuard(() => false);
    request.queues.set(queueName, hidden);

    const response = await queueJobsHandler({ ...request, query: { status: 'waiting' } });
    expect(response.status).toBe(404);

    request.queues.set(queueName, new BullMQAdapter(queue));
  });
});

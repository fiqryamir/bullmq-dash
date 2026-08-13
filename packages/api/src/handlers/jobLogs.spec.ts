import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BullMQAdapter } from '../queueAdapters/bullMQ';
import type { BullBoardQueues, BullBoardRequest, JobLogsResponse } from '../typings/app';
import { jobLogsHandler } from './jobLogs';

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
};

describe('jobLogsHandler', () => {
  const queueName = `bullmq-dash-test-logs-${randomUUID()}`;
  let queue: Queue;
  let jobId: string;
  let request: BullBoardRequest;

  beforeAll(async () => {
    queue = new Queue(queueName, { connection });
    const job = await queue.add('logged-job', { payload: 1 });

    jobId = job.id!;
    for (let index = 1; index <= 5; index += 1) {
      await queue.addJobLog(jobId, `log line ${index}`);
    }

    const queues: BullBoardQueues = new Map();
    queues.set(queueName, new BullMQAdapter(queue));

    request = {
      queues,
      uiConfig: {},
      query: {},
      params: { queueName, jobId },
      body: {},
      headers: {},
    };
  }, 30_000);

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
  }, 30_000);

  const send = async (
    query: Record<string, unknown> = {},
    params: Record<string, unknown> = { queueName, jobId }
  ): Promise<{ status?: number | undefined; body: JobLogsResponse & { error?: string } }> => {
    const response = await jobLogsHandler({ ...request, params, query });
    return {
      status: response.status,
      body: response.body as unknown as JobLogsResponse & { error?: string },
    };
  };

  it('returns the newest log rows first, paged', async () => {
    const { status, body } = await send({ page: '1', logsPerPage: '2' });

    expect(status).toBeUndefined();
    expect(body.logs).toEqual(['log line 5', 'log line 4']);
    expect(body.count).toBe(5);
    expect(body.pagination).toEqual({ pageCount: 3, range: { start: 0, end: 1 } });
  });

  it('pages through older rows', async () => {
    const { body } = await send({ page: '3', logsPerPage: '2' });
    expect(body.logs).toEqual(['log line 1']);
    expect(body.pagination).toEqual({ pageCount: 3, range: { start: 4, end: 5 } });
  });

  it('serves all rows on one page by default', async () => {
    const { body } = await send();
    expect(body.logs).toEqual(['log line 5', 'log line 4', 'log line 3', 'log line 2', 'log line 1']);
    expect(body.count).toBe(5);
    expect(body.pagination).toEqual({ pageCount: 1, range: { start: 0, end: 9 } });
  });

  it('clamps nonsensical page and page-size values', async () => {
    const { status, body } = await send({ page: '-3', logsPerPage: '0' });

    expect(status).toBeUndefined();
    expect(body.logs).toEqual(['log line 5']);
    expect(body.pagination).toEqual({ pageCount: 5, range: { start: 0, end: 0 } });
  });

  it('reports an empty log stream with no pages', async () => {
    const quiet = await queue.add('quiet-job', {});
    const { body } = await send({}, { queueName, jobId: quiet.id! });

    expect(body.logs).toEqual([]);
    expect(body.count).toBe(0);
    expect(body.pagination).toEqual({ pageCount: 0, range: { start: 0, end: 9 } });
  });

  it('reports an unknown job as not found', async () => {
    const { status, body } = await send({}, { queueName, jobId: randomUUID() });
    expect(status).toBe(404);
    expect(body.error).toBeTruthy();
  });

  it('reports an unregistered queue as not found', async () => {
    const { status, body } = await send({}, { queueName: 'not-a-queue', jobId });
    expect(status).toBe(404);
    expect(body.error).toBeTruthy();
  });

  it('hides queues behind a visibility guard', async () => {
    const hidden = new BullMQAdapter(queue);
    hidden.setVisibilityGuard(() => false);
    request.queues.set(queueName, hidden);

    const { status } = await send();
    expect(status).toBe(404);

    request.queues.set(queueName, new BullMQAdapter(queue));
  });
});

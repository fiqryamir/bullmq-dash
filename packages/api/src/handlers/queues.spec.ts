import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BullMQAdapter } from '../queueAdapters/bullMQ';
import type { AppQueue, BullBoardQueues, BullBoardRequest } from '../typings/app';
import { queuesHandler } from './queues';

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
};

describe('queuesHandler', () => {
  const queueNameA = `bullmq-dash-test-qa-${randomUUID()}`;
  const queueNameB = `bullmq-dash-test-qb-${randomUUID()}`;
  let queueA: Queue;
  let queueB: Queue;
  let request: BullBoardRequest;

  beforeAll(async () => {
    queueA = new Queue(queueNameA, { connection });
    queueB = new Queue(queueNameB, { connection });

    await queueA.add('job-a', { payload: 1 });
    await queueA.add('job-a', { payload: 2 });
    await queueB.add('job-b', { payload: 3 });

    const queues: BullBoardQueues = new Map();
    queues.set(queueNameA, new BullMQAdapter(queueA));
    queues.set(queueNameB, new BullMQAdapter(queueB));

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
    await queueA.obliterate({ force: true });
    await queueB.obliterate({ force: true });
    await queueA.close();
    await queueB.close();
  }, 30_000);

  const send = async (query: Record<string, unknown> = {}): Promise<AppQueue[]> => {
    const { body } = await queuesHandler({ ...request, query });
    return (body as { queues: AppQueue[] }).queues;
  };

  it('returns every registered queue with its counts', async () => {
    const queues = await send();
    expect(queues).toHaveLength(2);

    const queue = queues.find((entry) => entry.name === queueNameA);
    expect(queue).toBeDefined();
    expect(queue?.counts.waiting).toBe(2);
    expect(queue?.counts.completed).toBe(0);
    expect(queue?.type).toBe('bullmq');
    expect(queue?.readOnlyMode).toBe(false);
    expect(queue?.allowRetries).toBe(true);
    expect(queue?.isPaused).toBe(false);
    expect(queue?.statuses).toContain('latest');
    expect(queue?.jobs).toEqual([]);
  });

  it('returns the active queue with its jobs, paged', async () => {
    const [active] = await send({ activeQueue: queueNameA, status: 'waiting', page: '1', jobsPerPage: '2' });
    expect(active).toBeDefined();
    expect(active?.jobs).toHaveLength(2);
    expect(active?.jobs.map((job) => job.name)).toEqual(['job-a', 'job-a']);
    expect(active?.pagination).toEqual({
      pageCount: 1,
      range: { start: 0, end: 1 },
    });
  });

  it('honors the page offset for the active queue', async () => {
    const [active] = await send({ activeQueue: queueNameA, status: 'waiting', page: '2', jobsPerPage: '1' });
    expect(active?.jobs).toHaveLength(1);
    expect(active?.pagination).toEqual({
      pageCount: 2,
      range: { start: 1, end: 1 },
    });
  });

  it('shows one page of the latest jobs when no status is given', async () => {
    const [active] = await send({ activeQueue: queueNameA, page: '3', jobsPerPage: '2' });
    expect(active?.jobs).toHaveLength(2);
    expect(active?.pagination).toEqual({
      pageCount: 1,
      range: { start: 0, end: 1 },
    });
  });

  it('honors the status filter for the active queue', async () => {
    const [active] = await send({ activeQueue: queueNameA, status: 'completed' });
    expect(active?.jobs).toEqual([]);
  });

  it('skips queues hidden by a visibility guard', async () => {
    const hidden = new BullMQAdapter(queueA);
    hidden.setVisibilityGuard(() => false);
    request.queues.set(queueNameA, hidden);

    const queues = await send();
    expect(queues.some((entry) => entry.name === queueNameA)).toBe(false);
    expect(queues.some((entry) => entry.name === queueNameB)).toBe(true);

    request.queues.set(queueNameA, new BullMQAdapter(queueA));
  });

  it('reports whether workers consume the queue', async () => {
    const queues = await send();
    const queue = queues.find((entry) => entry.name === queueNameA);
    expect(queue?.hasWorkers).toBe(false);
  });

  it('does not probe workers when showWorkers is off', async () => {
    const queues = await send();
    expect(queues.every((entry) => entry.hasWorkers !== null)).toBe(true);

    const { body } = await queuesHandler({
      ...request,
      uiConfig: { showWorkers: false },
    });
    const { queues: hidden } = body as { queues: AppQueue[] };
    expect(hidden.every((entry) => entry.hasWorkers === null)).toBe(true);
  });

  it('shows the latest view when the status is explicitly latest', async () => {
    const [active] = await send({ activeQueue: queueNameA, status: 'latest' });
    expect(active?.pagination).toEqual({
      pageCount: 1,
      range: { start: 0, end: 9 },
    });
  });

  it('carries displayName and description options to the response', async () => {
    request.queues.set(
      queueNameA,
      new BullMQAdapter(queueA, { displayName: 'Shown name', description: 'A queue' })
    );
    const [active] = await send({ activeQueue: queueNameA });
    expect(active?.displayName).toBe('Shown name');
    expect(active?.description).toBe('A queue');
    request.queues.set(queueNameA, new BullMQAdapter(queueA));
  });

  it('reports workers unknown when probing them fails', async () => {
    class BrokenWorkersAdapter extends BullMQAdapter {
      override async getWorkers(): Promise<never> {
        throw new Error('redis down');
      }
    }

    request.queues.set(queueNameA, new BrokenWorkersAdapter(queueA));
    const [active] = await send({ activeQueue: queueNameA });
    expect(active?.hasWorkers).toBeNull();
    request.queues.set(queueNameA, new BullMQAdapter(queueA));
  });

  it('reports workers present when one is connected', async () => {
    class BusyWorkersAdapter extends BullMQAdapter {
      override async getWorkers() {
        return [{ id: '1', name: null, addr: '127.0.0.1:1', age: 3 }];
      }
    }

    request.queues.set(queueNameA, new BusyWorkersAdapter(queueA));
    const [active] = await send({ activeQueue: queueNameA });
    expect(active?.hasWorkers).toBe(true);
    request.queues.set(queueNameA, new BullMQAdapter(queueA));
  });
});

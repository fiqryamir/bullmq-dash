import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BullMQAdapter } from '../queueAdapters/bullMQ';
import type {
  BullBoardQueues,
  BullBoardRequest,
  SearchResponse,
  SearchResult,
} from '../typings/app';
import { searchHandler } from './search';

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
};

const resultsOf = (body: SearchResponse): SearchResult[] => body.results;

/** The matched ids, sorted — the search scans in the backing library's order, which is not part of the contract. */
const sortedIdsOf = (body: SearchResponse): string[] =>
  resultsOf(body)
    .map((result) => result.job.id ?? '')
    .sort();

describe('searchHandler', () => {
  const queueAName = `bullmq-dash-test-search-a-${randomUUID()}`;
  const queueBName = `bullmq-dash-test-search-b-${randomUUID()}`;
  let queueA: Queue;
  let queueB: Queue;
  let request: BullBoardRequest;

  beforeAll(async () => {
    queueA = new Queue(queueAName, { connection });
    queueB = new Queue(queueBName, { connection });

    await queueA.add('mail-job', { to: 'a@example.com' }, { jobId: 'mail-1' });
    await queueA.add('mail-job', { to: 'b@example.com' }, { jobId: 'mail-2' });
    await queueA.add('later-mail', { to: 'later@example.com' }, { jobId: 'mail-later', delay: 60_000 });
    await queueB.add('welcome-job', { to: 'c@example.com' }, { jobId: 'bill-1' });

    const queues: BullBoardQueues = new Map();
    queues.set(queueAName, new BullMQAdapter(queueA));
    queues.set(queueBName, new BullMQAdapter(queueB));

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

  const send = async (
    query: Record<string, unknown> = {},
    params: Record<string, unknown> = {}
  ): Promise<{ status?: number | undefined; body: SearchResponse & { error?: string } }> => {
    const response = await searchHandler({ ...request, query, params });
    return {
      status: response.status,
      body: response.body as unknown as SearchResponse & { error?: string },
    };
  };

  it('matches jobs by a partial id across every queue', async () => {
    const { status, body } = await send({ term: 'mail-' });

    expect(status).toBeUndefined();
    expect(body.term).toBe('mail-');
    expect(sortedIdsOf(body)).toEqual(['mail-1', 'mail-2', 'mail-later']);
    expect(resultsOf(body).map((result) => result.queue)).toEqual([
      queueAName,
      queueAName,
      queueAName,
    ]);
  });

  it('matches job names case-insensitively', async () => {
    const byName = await send({ term: 'WELCOME' });
    expect(sortedIdsOf(byName.body)).toEqual(['bill-1']);

    const byNameTail = await send({ term: 'LATER' });
    expect(sortedIdsOf(byNameTail.body)).toEqual(['mail-later']);
  });

  it('reports the state each match was found under', async () => {
    const { body } = await send({ term: 'mail' });
    const statesById = Object.fromEntries(
      resultsOf(body).map((result) => [result.job.id, result.state])
    );
    expect(statesById).toEqual({ 'mail-1': 'waiting', 'mail-2': 'waiting', 'mail-later': 'delayed' });

    const mailOne = resultsOf(body).find((result) => result.job.id === 'mail-1');
    expect(mailOne?.job).toMatchObject({
      id: 'mail-1',
      name: 'mail-job',
      attempts: 0,
      progress: 0,
    });
    expect(mailOne?.job.data).toEqual({ to: 'a@example.com' });
  });

  it('filters matches by a single state', async () => {
    const waiting = await send({ term: 'mail', status: 'waiting' });
    expect(sortedIdsOf(waiting.body)).toEqual(['mail-1', 'mail-2']);

    const delayed = await send({ term: 'mail', status: 'delayed' });
    expect(sortedIdsOf(delayed.body)).toEqual(['mail-later']);
  });

  it('filters matches by a comma-separated state list', async () => {
    const { body } = await send({ term: 'mail', status: 'delayed,failed' });
    expect(resultsOf(body).map((result) => result.job.id)).toEqual(['mail-later']);
  });

  it('scopes the search to a single queue', async () => {
    const { body } = await send({ term: '1' }, { queueName: queueAName });
    expect(resultsOf(body).map((result) => result.queue)).toEqual([queueAName]);
    expect(sortedIdsOf(body)).toEqual(['mail-1']);
  });

  it('reports an unregistered queue as not found', async () => {
    const { status } = await send({ term: 'mail' }, { queueName: 'not-a-queue' });
    expect(status).toBe(404);
  });

  it('hides queues behind a visibility guard', async () => {
    const hidden = new BullMQAdapter(queueB);
    hidden.setVisibilityGuard(() => false);
    request.queues.set(queueBName, hidden);

    const { body } = await send({ term: 'bill' });
    expect(resultsOf(body)).toEqual([]);

    request.queues.set(queueBName, new BullMQAdapter(queueB));
  });

  it('reports a missing or blank term as a bad request', async () => {
    expect((await send({})).status).toBe(400);
    expect((await send({ term: '   ' })).status).toBe(400);
  });

  it('reports an unknown state as a bad request', async () => {
    const { status } = await send({ term: 'mail', status: 'nonsense' });
    expect(status).toBe(400);
  });

  describe('result cap and deepen continuation', () => {
    const cappedName = `bullmq-dash-test-search-cap-${randomUUID()}`;
    let cappedQueue: Queue;

    beforeAll(async () => {
      cappedQueue = new Queue(cappedName, { connection });
      await cappedQueue.addBulk(
        Array.from({ length: 505 }, (_, index) => ({
          name: 'capped-job',
          data: { index },
          opts: { jobId: `capped-${index}` },
        }))
      );
    }, 60_000);

    afterAll(async () => {
      await cappedQueue.obliterate({ force: true });
      await cappedQueue.close();
    }, 30_000);

    const cappedRequest = (query: Record<string, unknown>) => {
      const queues: BullBoardQueues = new Map();
      queues.set(cappedName, new BullMQAdapter(cappedQueue));
      return searchHandler({
        queues,
        uiConfig: {},
        query,
        params: {},
        body: {},
        headers: {},
      });
    };

    it('returns the first 500 matches with a deepen continuation', async () => {
      const response = await cappedRequest({ term: 'capped-' });

      expect(response.status).toBeUndefined();
      const body = response.body as unknown as SearchResponse;
      expect(body.count).toBe(500);
      expect(body.results).toHaveLength(500);
      expect(body.totalScanned).toBe(500);
      expect(body.deepen).toBe(true);
    });

    it('continues past the cap from the scanned offset', async () => {
      const first = (await cappedRequest({ term: 'capped-' })).body as unknown as SearchResponse;
      const continued = (await cappedRequest({ term: 'capped-', start: String(first.totalScanned) }))
        .body as unknown as SearchResponse;

      expect(continued.count).toBe(5);
      expect(continued.totalScanned).toBe(5);
      expect(continued.deepen).toBe(false);
    });
  });

  describe('scan window and deepen continuation', () => {
    const scannedName = `bullmq-dash-test-search-scan-${randomUUID()}`;
    let scannedQueue: Queue;

    beforeAll(async () => {
      scannedQueue = new Queue(scannedName, { connection });
      await scannedQueue.addBulk(
        Array.from({ length: 5001 }, (_, index) => ({
          name: 'scan-job',
          data: { index },
          opts: { jobId: `scan-${index}` },
        }))
      );
    }, 60_000);

    afterAll(async () => {
      await scannedQueue.obliterate({ force: true });
      await scannedQueue.close();
    }, 60_000);

    const scannedRequest = (query: Record<string, unknown>) => {
      const queues: BullBoardQueues = new Map();
      queues.set(scannedName, new BullMQAdapter(scannedQueue));
      return searchHandler({
        queues,
        uiConfig: {},
        query,
        params: {},
        body: {},
        headers: {},
      });
    };

    it('deepens past the scan window when nothing matches', async () => {
      const first = (await scannedRequest({ term: 'zzz-nothing' })).body as unknown as SearchResponse;
      expect(first.count).toBe(0);
      expect(first.totalScanned).toBe(5000);
      expect(first.deepen).toBe(true);

      const continued = (await scannedRequest({ term: 'zzz-nothing', start: String(first.totalScanned) }))
        .body as unknown as SearchResponse;
      expect(continued.count).toBe(0);
      expect(continued.totalScanned).toBe(1);
      expect(continued.deepen).toBe(false);
    });
  });
});

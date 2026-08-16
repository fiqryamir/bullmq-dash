import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BullMQAdapter, createBullBoard, type AppQueue } from '@bullmq-dash/api';
import { Queue, Worker } from 'bullmq';
import express, { type Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pollUntil } from '../../api/src/testUtils/pollUntil';
import { seedQueueJobs } from '../../api/src/testUtils/seedQueueJobs';
import { ExpressAdapter } from './index';

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
};

describe('ExpressAdapter', () => {
  describe('embedded in a host app', () => {
    const queueName = `bullmq-dash-express-${randomUUID()}`;
    let queue: Queue;
    let app: Express;
    let board: ReturnType<typeof createBullBoard>;

    beforeAll(async () => {
      queue = new Queue(queueName, { connection });
      await queue.add('email', { to: 'a@example.com' });
      await queue.add('email', { to: 'b@example.com' });
      await queue.add('reminder', { to: 'later@example.com' }, { delay: 60_000 });

      const serverAdapter = new ExpressAdapter();
      board = createBullBoard({
        queues: [new BullMQAdapter(queue)],
        serverAdapter,
      });

      app = express();
      app.use(serverAdapter.getRouter());
    }, 30_000);

    afterAll(async () => {
      await board.closeMetrics();
      await queue.obliterate({ force: true });
      await queue.close();
    }, 30_000);

    it('serves per-minute metrics buckets from GET /api/queues/:queueName/metrics', async () => {
      const now = Date.now();
      const response = await request(app)
        .get(`/api/queues/${queueName}/metrics`)
        .query({ from: String(now - 60_000), to: String(now) })
        .expect(200);
      expect(response.body.queue).toBe(queueName);
      expect(response.body.buckets).toHaveLength(2);
      for (const bucket of response.body.buckets as Array<{ ts: number }>) {
        expect(bucket.ts).toEqual(expect.any(Number));
      }
    });

    it('serves every registered queue with its counts from GET /api/queues', async () => {
      const response = await request(app).get('/api/queues').expect(200);
      const queues = response.body.queues as AppQueue[];
      expect(queues).toHaveLength(1);
      expect(queues[0]).toMatchObject({
        name: queueName,
        type: 'bullmq',
        counts: expect.objectContaining({ waiting: 2 }),
      });
      expect(queues[0]?.jobs).toEqual([]);
    });

    it('returns the active queue jobs through the REST contract', async () => {
      const response = await request(app)
        .get(`/api/queues?activeQueue=${queueName}&status=waiting&page=1&jobsPerPage=10`)
        .expect(200);
      const queues = response.body.queues as AppQueue[];
      expect(queues[0]?.jobs.map((job) => job.name)).toEqual(['email', 'email']);
    });

    describe('GET /api/queues/:queueName/jobs', () => {
      it('pages the jobs of a state through the pagination contract', async () => {
        const response = await request(app)
          .get(`/api/queues/${queueName}/jobs`)
          .query({ status: 'waiting', page: 1, jobsPerPage: 1 })
          .expect(200);

        expect(response.body.jobs).toHaveLength(1);
        expect(response.body.jobs[0]).toMatchObject({
          name: 'email',
          state: 'waiting',
          attempts: 0,
        });
        expect(response.body.pagination).toEqual({ pageCount: 2, range: { start: 0, end: 0 } });
      });

      it('honors the page offset for the next page', async () => {
        const response = await request(app)
          .get(`/api/queues/${queueName}/jobs`)
          .query({ status: 'waiting', page: 2, jobsPerPage: 1 })
          .expect(200);

        expect(response.body.jobs).toHaveLength(1);
        expect(response.body.pagination).toEqual({ pageCount: 2, range: { start: 1, end: 1 } });
        expect(response.body.jobs[0].id).toBeTruthy();
      });

      it('serves every state the switcher offers', async () => {
        const delayed = await request(app)
          .get(`/api/queues/${queueName}/jobs`)
          .query({ status: 'delayed' })
          .expect(200);
        const delayedJobs = delayed.body.jobs as { name: string }[];
        expect(delayedJobs.map((job) => job.name)).toEqual(['reminder']);

        const failed = await request(app)
          .get(`/api/queues/${queueName}/jobs`)
          .query({ status: 'failed' })
          .expect(200);
        expect(failed.body.jobs).toEqual([]);
        expect(failed.body.pagination).toEqual({ pageCount: 0, range: { start: 0, end: 9 } });
      });

      it('lists the waiting jobs under the paused state while the queue is paused', async () => {
        await queue.pause();
        const response = await request(app)
          .get(`/api/queues/${queueName}/jobs`)
          .query({ status: 'paused' })
          .expect(200);
        await queue.resume();

        const jobs = response.body.jobs as { name: string; state: string }[];
        expect(jobs.map((job) => job.name)).toEqual(['email', 'email']);
        expect(jobs.map((job) => job.state)).toEqual(['paused', 'paused']);
      });

      it('answers unknown queues with 404 and unknown states with 400', async () => {
        await request(app)
          .get('/api/queues/not-a-queue/jobs')
          .query({ status: 'waiting' })
          .expect(404);
        await request(app)
          .get(`/api/queues/${queueName}/jobs`)
          .query({ status: 'nonsense' })
          .expect(400);
      });
    });

    describe('GET /api/queues/:queueName/:jobId', () => {
      it('returns the job detail with its data through the REST contract', async () => {
        const [job] = await queue.getJobs(['waiting']);
        const response = await request(app).get(`/api/queues/${queueName}/${job!.id}`).expect(200);

        expect(response.body.job).toMatchObject({
          id: job!.id,
          name: 'email',
        });
        expect(response.body.job.data).toEqual(job!.data);
        expect(response.body.status).toBe('waiting');
      });

      it('returns the job logs through the REST contract', async () => {
        const [job] = await queue.getJobs(['waiting']);
        await queue.addJobLog(job!.id!, 'http log row');

        const response = await request(app)
          .get(`/api/queues/${queueName}/${job!.id}/logs`)
          .expect(200);

        expect(response.body.logs).toEqual(['http log row']);
        expect(response.body.count).toBe(1);
        expect(response.body.pagination).toEqual({ pageCount: 1, range: { start: 0, end: 9 } });
      });

      it('pages the job logs through the REST contract', async () => {
        const [delayed] = await queue.getJobs(['delayed']);
        await queue.addJobLog(delayed!.id!, 'http log 1');
        await queue.addJobLog(delayed!.id!, 'http log 2');
        await queue.addJobLog(delayed!.id!, 'http log 3');

        const first = await request(app)
          .get(`/api/queues/${queueName}/${delayed!.id}/logs`)
          .query({ page: 1, logsPerPage: 2 })
          .expect(200);
        expect(first.body.logs).toEqual(['http log 3', 'http log 2']);
        expect(first.body.count).toBe(3);
        expect(first.body.pagination).toEqual({ pageCount: 2, range: { start: 0, end: 1 } });

        const second = await request(app)
          .get(`/api/queues/${queueName}/${delayed!.id}/logs`)
          .query({ page: 2, logsPerPage: 2 })
          .expect(200);
        expect(second.body.logs).toEqual(['http log 1']);
        expect(second.body.pagination).toEqual({ pageCount: 2, range: { start: 2, end: 3 } });
      });

      it('keeps the literal jobs list route ahead of the job detail route', async () => {
        const response = await request(app)
          .get(`/api/queues/${queueName}/jobs`)
          .query({ status: 'waiting' })
          .expect(200);
        expect(Array.isArray(response.body.jobs)).toBe(true);
      });

      it('answers unknown jobs with 404', async () => {
        await request(app).get(`/api/queues/${queueName}/missing`).expect(404);
      });
    });

    it('serves the routes under the host-app base path', async () => {
      const serverAdapter = new ExpressAdapter();
      serverAdapter.setBasePath('/board');
      createBullBoard({
        queues: [new BullMQAdapter(queue)],
        serverAdapter,
      });

      const mounted = express();
      mounted.use('/board', serverAdapter.getRouter());

      const response = await request(mounted).get('/board/api/queues').expect(200);
      const queues = response.body.queues as AppQueue[];
      expect(queues).toHaveLength(1);
    });
  });

  describe('mutation routes through the REST contract', () => {
    const queueName = `bullmq-dash-express-actions-${randomUUID()}`;
    let queue: Queue;
    let app: Express;

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
      await pollUntil(async () => (await failedJob.isFailed()), 10_000);
      await worker.close();

      await queue.add('later', { index: 2 }, { delay: 60_000 });
      await queue.add('wait', { index: 3 });

      const serverAdapter = new ExpressAdapter();
      createBullBoard({
        queues: [new BullMQAdapter(queue)],
        serverAdapter,
      });

      app = express();
      app.use(serverAdapter.getRouter());
    }, 30_000);

    afterAll(async () => {
      await queue.obliterate({ force: true });
      await queue.close();
    }, 30_000);

    const jobIdOf = async (name: string): Promise<string> => {
      const found = await queue.getJobs(['waiting', 'failed', 'delayed']);
      const target = found.find((job) => job.name === name);
      if (!target?.id) {
        throw new Error(`no job named ${name} (have ${found.map((job) => job.name)})`);
      }
      return target.id;
    };

    it('retries a failed job from its endpoint', async () => {
      const jobId = await jobIdOf('fail-me');
      await request(app).put(`/api/queues/${queueName}/${jobId}/retry`).expect(204);
      expect(await (await queue.getJob(jobId))?.getState()).toBe('waiting');
    });

    it('promotes a delayed job from its endpoint', async () => {
      const jobId = await jobIdOf('later');
      await request(app).put(`/api/queues/${queueName}/${jobId}/promote`).expect(204);
      expect(await (await queue.getJob(jobId))?.getState()).toBe('waiting');
    });

    it('removes a job from its endpoint', async () => {
      const jobId = await jobIdOf('wait');
      await request(app).put(`/api/queues/${queueName}/${jobId}/remove`).expect(204);
      expect(await queue.getJob(jobId)).toBeUndefined();
    });

    it('removes a job from its bull-board clean alias', async () => {
      const job = await queue.add('wait', { index: 6 });
      await request(app).put(`/api/queues/${queueName}/${job.id}/clean`).expect(204);
      expect(await queue.getJob(job.id!)).toBeUndefined();
    });

    it('retries every failed job in bulk', async () => {
      const worker = new Worker(queueName, async () => Promise.reject(new Error('boom')), {
        connection,
      });
      await queue.add('fail-me', { index: 4 });
      await pollUntil(async () => (await queue.getJobCountByTypes('failed')) > 0, 10_000);
      await worker.close();

      const response = await request(app)
        .put(`/api/queues/${queueName}/retry/failed`)
        .expect(200);
      expect(response.body.retried).toBeGreaterThanOrEqual(1);
      expect(await queue.getJobCountByTypes('failed')).toBe(0);
    });

    it('rejects a non-retriable bulk status', async () => {
      await request(app).put(`/api/queues/${queueName}/retry/waiting`).expect(400);
    });

    it('pauses and resumes the queue', async () => {
      await request(app).put(`/api/queues/${queueName}/pause`).expect(200);
      expect(await queue.isPaused()).toBe(true);
      await request(app).put(`/api/queues/${queueName}/resume`).expect(200);
      expect(await queue.isPaused()).toBe(false);
    });

    it('empties the waiting jobs', async () => {
      await queue.add('wait', { index: 5 });
      await request(app).put(`/api/queues/${queueName}/empty`).expect(200);
      expect(await queue.getJobCountByTypes('waiting')).toBe(0);
    });

    it('cleans the completed jobs older than the grace period', async () => {
      const worker = new Worker(queueName, async () => 'result', { connection });
      const done = await queue.add('done', { index: 6 });
      await pollUntil(async () => (await done.isCompleted()), 10_000);
      await worker.close();

      await request(app)
        .put(`/api/queues/${queueName}/clean/completed`)
        .query({ grace: 0 })
        .expect(200);
      expect(await queue.getJobCountByTypes('completed')).toBe(0);
    });
  });

  describe('search routes through the REST contract', () => {
    const queueName = `bullmq-dash-express-search-${randomUUID()}`;
    const secondQueueName = `bullmq-dash-express-search-2-${randomUUID()}`;
    const cappedQueueName = `bullmq-dash-express-search-cap-${randomUUID()}`;
    let queue: Queue;
    let secondQueue: Queue;
    let cappedQueue: Queue;
    let app: Express;

    beforeAll(async () => {
      queue = new Queue(queueName, { connection });
      secondQueue = new Queue(secondQueueName, { connection });
      cappedQueue = new Queue(cappedQueueName, { connection });

      await queue.add('mail-job', { to: 'a@example.com' }, { jobId: 'mail-1' });
      await queue.add('later-mail', { to: 'later@example.com' }, { jobId: 'mail-later', delay: 60_000 });
      await secondQueue.add('welcome-job', { to: 'c@example.com' }, { jobId: 'bill-1' });
      await seedQueueJobs(cappedQueue, 'capped', 505);

      const serverAdapter = new ExpressAdapter();
      createBullBoard({
        queues: [
          new BullMQAdapter(queue),
          new BullMQAdapter(secondQueue),
          new BullMQAdapter(cappedQueue),
        ],
        serverAdapter,
      });

      app = express();
      app.use(serverAdapter.getRouter());
    }, 60_000);

    afterAll(async () => {
      await queue.obliterate({ force: true });
      await secondQueue.obliterate({ force: true });
      await cappedQueue.obliterate({ force: true });
      await queue.close();
      await secondQueue.close();
      await cappedQueue.close();
    }, 60_000);

    it('matches jobs by a partial id across every queue', async () => {
      const response = await request(app).get('/api/search').query({ term: 'mail-' }).expect(200);

      expect(response.body.term).toBe('mail-');
      expect(response.body.count).toBe(2);
      expect(response.body.deepen).toBe(false);
      expect(response.body.results.map((result: { job: { id: string } }) => result.job.id).sort()).toEqual([
        'mail-1',
        'mail-later',
      ]);
      expect(response.body.results.map((result: { queue: string }) => result.queue)).toEqual([
        queueName,
        queueName,
      ]);
    });

    it('matches job names case-insensitively', async () => {
      const response = await request(app).get('/api/search').query({ term: 'WELCOME' }).expect(200);

      expect(response.body.results).toHaveLength(1);
      expect(response.body.results[0]).toMatchObject({
        queue: secondQueueName,
        job: { id: 'bill-1', name: 'welcome-job' },
        state: 'waiting',
      });
    });

    it('filters matches by the state chips', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ term: 'mail', status: 'delayed' })
        .expect(200);

      expect(response.body.results.map((result: { job: { id: string } }) => result.job.id)).toEqual([
        'mail-later',
      ]);
      expect(response.body.results[0].state).toBe('delayed');
    });

    it('scopes the search inside a queue and 404s unknown queues', async () => {
      const scoped = await request(app)
        .get(`/api/queues/${queueName}/search`)
        .query({ term: 'bill' })
        .expect(200);
      expect(scoped.body.results).toEqual([]);

      await request(app).get('/api/queues/not-a-queue/search').query({ term: 'mail' }).expect(404);
    });

    it('caps results at 500 with a deepen continuation', async () => {
      const first = await request(app).get('/api/search').query({ term: 'capped-' }).expect(200);
      expect(first.body.count).toBe(500);
      expect(first.body.results).toHaveLength(500);
      expect(first.body.deepen).toBe(true);

      const continued = await request(app)
        .get('/api/search')
        .query({ term: 'capped-', start: first.body.totalScanned })
        .expect(200);
      expect(continued.body.count).toBe(5);
      expect(continued.body.deepen).toBe(false);
    });

    it('rejects a missing term and an unknown state', async () => {
      await request(app).get('/api/search').expect(400);
      await request(app).get('/api/search').query({ term: 'mail', status: 'nonsense' }).expect(400);
    });
  });

  describe('metrics capture through the REST contract', () => {
    const queueName = `bullmq-dash-express-metrics-${randomUUID()}`;
    let queue: Queue;
    let worker: Worker;
    let app: Express;
    let board: ReturnType<typeof createBullBoard>;

    beforeAll(async () => {
      queue = new Queue(queueName, { connection });
      worker = new Worker(queueName, async () => {}, { connection });
      await worker.waitUntilReady();

      const serverAdapter = new ExpressAdapter();
      board = createBullBoard({
        queues: [new BullMQAdapter(queue)],
        serverAdapter,
      });

      app = express();
      app.use(serverAdapter.getRouter());

      // Delayed so the capture's event subscription is live before the work
      // runs: the endpoint then serves event-derived buckets deterministically.
      await queue.add('metric-job', { i: 1 }, { delay: 1_500 });
      await queue.add('metric-job', { i: 2 }, { delay: 1_500 });
    }, 30_000);

    afterAll(async () => {
      await board.closeMetrics();
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }, 30_000);

    it('serves event-derived completed counts with averages', async () => {
      const completedTotal = async () => {
        const response = await request(app).get(`/api/queues/${queueName}/metrics`).expect(200);
        const buckets = response.body.buckets as Array<{
          completed: number;
          durationAvgMs: number | null;
          waitAvgMs: number | null;
        }>;
        return {
          completed: buckets.reduce((sum, bucket) => sum + bucket.completed, 0),
          averages: buckets.filter(
            (bucket) => bucket.completed > 0 && bucket.durationAvgMs !== null && bucket.waitAvgMs !== null
          ),
        };
      };

      await pollUntil(async () => (await completedTotal()).completed >= 2, 15_000);

      const { averages } = await completedTotal();
      expect(averages.length).toBeGreaterThanOrEqual(1);
    }, 20_000);
  });

  describe('schedulers, workers and Redis stats through the REST contract', () => {
    const queueName = `bullmq-dash-express-schedulers-${randomUUID()}`;
    const otherQueueName = `bullmq-dash-express-schedulers-2-${randomUUID()}`;
    let queue: Queue;
    let otherQueue: Queue;
    let worker: Worker;
    let app: Express;

    beforeAll(async () => {
      queue = new Queue(queueName, { connection });
      otherQueue = new Queue(otherQueueName, { connection });
      worker = new Worker(queueName, async () => 'result', { connection, name: 'mailer' });
      await worker.waitUntilReady();

      await queue.upsertJobScheduler('nightly', { every: 86_400_000 }, { name: 'nightly-digest' });
      await otherQueue.upsertJobScheduler('weekly', { pattern: '0 0 * * 1' }, { name: 'weekly-report' });

      const serverAdapter = new ExpressAdapter();
      createBullBoard({
        queues: [new BullMQAdapter(queue), new BullMQAdapter(otherQueue)],
        serverAdapter,
      });

      app = express();
      app.use(serverAdapter.getRouter());
    }, 30_000);

    afterAll(async () => {
      await worker.close();
      await queue.obliterate({ force: true });
      await otherQueue.obliterate({ force: true });
      await queue.close();
      await otherQueue.close();
    }, 30_000);

    describe('GET /api/job-schedulers', () => {
      it('lists every scheduler across the queues with their queue names', async () => {
        const response = await request(app).get('/api/job-schedulers').expect(200);

        const schedulers = response.body.schedulers as Array<{ id: string; queueName: string }>;
        expect(schedulers.map((scheduler) => scheduler.id).sort()).toEqual(['nightly', 'weekly']);
        const nightly = schedulers.find((scheduler) => scheduler.id === 'nightly');
        expect(nightly).toMatchObject({ queueName, name: 'nightly-digest' });
      });

      it('scopes the list to one queue through the queueName query', async () => {
        const response = await request(app)
          .get('/api/job-schedulers')
          .query({ queueName })
          .expect(200);

        const schedulers = response.body.schedulers as Array<{ id: string; queueName: string }>;
        expect(schedulers).toHaveLength(1);
        expect(schedulers[0]).toMatchObject({ id: 'nightly', queueName });
      });
    });

    describe('scheduler CRUD', () => {
      it('creates a scheduler through POST and lists it afterwards', async () => {
        const created = await request(app)
          .post(`/api/queues/${queueName}/job-schedulers`)
          .send({
            id: 'created-via-http',
            repeat: { every: 60_000 },
            jobTemplate: { name: 'heartbeat', data: { via: 'http' } },
          })
          .expect(201);
        expect(created.body.scheduler).toMatchObject({ id: 'created-via-http', name: 'heartbeat' });

        const listed = await request(app).get('/api/job-schedulers').expect(200);
        const schedulers = listed.body.schedulers as Array<{ id: string; template?: { data?: unknown } }>;
        const stored = schedulers.find((scheduler) => scheduler.id === 'created-via-http');
        expect(stored).toBeDefined();
        expect(stored?.template?.data).toEqual({ via: 'http' });
      });

      it('updates a scheduler schedule through PATCH', async () => {
        await request(app)
          .patch(`/api/queues/${queueName}/job-schedulers/nightly`)
          .send({ every: 43_200_000, limit: 5 })
          .expect(204);

        const stored = await queue.getJobScheduler('nightly');
        expect(stored).toMatchObject({ every: 43_200_000, limit: 5, name: 'nightly-digest' });
      });

      it('rejects an update without a schedule with 400', async () => {
        await request(app)
          .patch(`/api/queues/${queueName}/job-schedulers/nightly`)
          .send({})
          .expect(400);
      });

      it('removes a scheduler through PUT and 404s the second time', async () => {
        await request(app)
          .put(`/api/queues/${queueName}/job-schedulers/nightly/remove`)
          .expect(204);
        expect(await queue.getJobScheduler('nightly')).toBeUndefined();

        await request(app)
          .put(`/api/queues/${queueName}/job-schedulers/nightly/remove`)
          .expect(404);
      });

      it('answers unknown queues and schedulers with 404', async () => {
        await request(app)
          .post('/api/queues/not-a-queue/job-schedulers')
          .send({ id: 'x', repeat: { every: 1000 } })
          .expect(404);
        await request(app)
          .patch(`/api/queues/${queueName}/job-schedulers/missing`)
          .send({ every: 1000 })
          .expect(404);
        await request(app)
          .put(`/api/queues/${queueName}/job-schedulers/missing/remove`)
          .expect(404);
      });

      it('rejects a malformed create with 400', async () => {
        await request(app)
          .post(`/api/queues/${queueName}/job-schedulers`)
          .send({ id: 'broken', repeat: {} })
          .expect(400);
        await request(app)
          .post(`/api/queues/${queueName}/job-schedulers`)
          .send({ id: 'broken', repeat: { pattern: 'not a cron' } })
          .expect(400);
      });
    });

    describe('GET /api/queues/:queueName/workers', () => {
      it('lists the connected workers of a queue', async () => {
        const response = await request(app)
          .get(`/api/queues/${queueName}/workers`)
          .expect(200);

        expect(response.body.workers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: 'mailer', addr: expect.any(String) }),
          ])
        );
      });

      it('answers an empty list when no worker is connected', async () => {
        const response = await request(app)
          .get(`/api/queues/${otherQueueName}/workers`)
          .expect(200);

        expect(response.body.workers).toEqual([]);
      });

      it('answers 404 for an unknown queue', async () => {
        await request(app).get('/api/queues/not-a-queue/workers').expect(404);
      });
    });

    describe('GET /api/redis/stats', () => {
      it('reports the Redis version, memory and clients', async () => {
        const response = await request(app).get('/api/redis/stats').expect(200);

        expect(response.body).toEqual(
          expect.objectContaining({
            backend: 'redis',
            version: expect.any(String),
            memory: expect.objectContaining({
              used: expect.any(Number),
              peak: expect.any(Number),
            }),
            clients: expect.objectContaining({
              connected: expect.any(Number),
              blocked: expect.any(Number),
            }),
          })
        );
      });
    });
  });

  describe('readOnly board', () => {
    const queueName = `bullmq-dash-express-readonly-${randomUUID()}`;
    let queue: Queue;
    let app: Express;

    beforeAll(async () => {
      queue = new Queue(queueName, { connection });
      await queue.add('wait', { index: 1 });
      await queue.upsertJobScheduler('kept', { every: 60_000 }, { name: 'kept' });

      const serverAdapter = new ExpressAdapter();
      createBullBoard({
        queues: [new BullMQAdapter(queue)],
        serverAdapter,
        options: { readOnly: true },
      });

      app = express();
      app.use(serverAdapter.getRouter());
    }, 30_000);

    afterAll(async () => {
      await queue.obliterate({ force: true });
      await queue.close();
    }, 30_000);

    it('marks every queue read-only in the queues response', async () => {
      const response = await request(app).get('/api/queues').expect(200);
      const queues = response.body.queues as AppQueue[];
      expect(queues[0]?.readOnlyMode).toBe(true);
    });

    it('blocks every mutation with a 403', async () => {
      await request(app).put(`/api/queues/${queueName}/pause`).expect(403);
      await request(app).put(`/api/queues/${queueName}/resume`).expect(403);
      await request(app).put(`/api/queues/${queueName}/empty`).expect(403);
      await request(app).put(`/api/queues/${queueName}/retry/failed`).expect(403);
      await request(app).put(`/api/queues/${queueName}/promote`).expect(403);
      await request(app).put(`/api/queues/${queueName}/clean/completed`).expect(403);
      await request(app).put(`/api/queues/${queueName}/remove/failed`).expect(403);

      await request(app)
        .post(`/api/queues/${queueName}/job-schedulers`)
        .send({ id: 'new', repeat: { every: 1000 } })
        .expect(403);
      await request(app)
        .patch(`/api/queues/${queueName}/job-schedulers/kept`)
        .send({ every: 2000 })
        .expect(403);
      await request(app)
        .put(`/api/queues/${queueName}/job-schedulers/kept/remove`)
        .expect(403);
      expect(await queue.getJobScheduler('kept')).toBeDefined();

      const [job] = await queue.getJobs(['waiting']);
      await request(app).put(`/api/queues/${queueName}/${job!.id}/retry`).expect(403);
      await request(app).put(`/api/queues/${queueName}/${job!.id}/promote`).expect(403);
      await request(app).put(`/api/queues/${queueName}/${job!.id}/clean`).expect(403);
      await request(app).put(`/api/queues/${queueName}/${job!.id}/remove`).expect(403);

      expect(await queue.isPaused()).toBe(false);
      // The seeded `wait` job plus the scheduler's first run job: `empty` and
      // `remove` were blocked, so nothing was drained.
      expect(await queue.getJobCountByTypes('waiting')).toBeGreaterThanOrEqual(1);
    });
  });

  describe('as a fluent adapter', () => {
    it('returns itself from setBasePath and a router from getRouter', () => {
      const adapter = new ExpressAdapter();
      expect(adapter.setBasePath('/board')).toBe(adapter);
      expect(typeof adapter.getRouter()).toBe('function');
    });

    it('throws when api routes are set before the error handler', () => {
      const adapter = new ExpressAdapter();
      expect(() => adapter.setApiRoutes([])).toThrow(
        `Please call 'setErrorHandler' before calling 'setApiRoutes'`
      );
    });

    it('throws when api routes are set before the queues', () => {
      const adapter = new ExpressAdapter();
      adapter.setErrorHandler(() => ({ status: 500, body: 'error' }));
      expect(() => adapter.setApiRoutes([])).toThrow(
        `Please call 'setQueues' before calling 'setApiRoutes'`
      );
    });

    it('bridges handler failures through the error handler', async () => {
      const adapter = new ExpressAdapter();
      adapter.setQueues(new Map());
      adapter.setErrorHandler((error) => ({
        status: 500,
        body: { error: 'Queue error', details: error.message },
      }));
      adapter.setApiRoutes([
        {
          method: 'get',
          route: '/api/broken',
          handler: () => {
            throw new Error('boom');
          },
        },
      ]);

      const response = await request(adapter.getRouter()).get('/api/broken').expect(500);
      expect(response.body).toEqual({ error: 'Queue error', details: 'boom' });
    });
  });

  describe('views and static assets', () => {
    let dir: string;
    let adapter: ExpressAdapter;

    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), 'bullmq-dash-'));
      mkdirSync(join(dir, 'static'));
      writeFileSync(join(dir, 'static', 'asset.txt'), 'asset-content');
      writeFileSync(join(dir, 'board.ejs'), '<h1><%= title %></h1>');

      adapter = new ExpressAdapter();
      adapter.setViewsPath(dir);
      adapter.setStaticPath('/static', join(dir, 'static'));
      adapter.setEntryRoute({
        method: 'get',
        route: '/',
        handler: () => ({ name: 'board', params: { title: 'Hello Board' } }),
      });
    });

    afterAll(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('serves static assets', async () => {
      await request(adapter.getRouter()).get('/static/asset.txt').expect(200, 'asset-content');
    });

    it('renders the entry route view', async () => {
      const response = await request(adapter.getRouter()).get('/').expect(200);
      expect(response.text).toContain('Hello Board');
    });
  });
});

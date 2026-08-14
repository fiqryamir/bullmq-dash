import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BullMQAdapter, createBullBoard, type AppQueue } from '@bullmq-dash/api';
import { Queue, Worker } from 'bullmq';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pollUntil } from '../../api/src/testUtils/pollUntil';
import { seedQueueJobs } from '../../api/src/testUtils/seedQueueJobs';
import { FastifyAdapter } from './index';

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
};

function mountAdapter(serverAdapter: FastifyAdapter, prefix?: string): FastifyInstance {
  const app = Fastify();
  if (prefix) {
    app.register(serverAdapter.registerPlugin(), { prefix });
  } else {
    app.register(serverAdapter.registerPlugin());
  }
  return app;
}

describe('FastifyAdapter', () => {
  describe('embedded in a host app', () => {
    const queueName = `bullmq-dash-fastify-${randomUUID()}`;
    let queue: Queue;
    let app: FastifyInstance;

    beforeAll(async () => {
      queue = new Queue(queueName, { connection });
      await queue.add('email', { to: 'a@example.com' });
      await queue.add('email', { to: 'b@example.com' });
      await queue.add('reminder', { to: 'later@example.com' }, { delay: 60_000 });

      const serverAdapter = new FastifyAdapter();
      createBullBoard({
        queues: [new BullMQAdapter(queue)],
        serverAdapter,
      });

      app = mountAdapter(serverAdapter);
      await app.ready();
    }, 30_000);

    afterAll(async () => {
      await queue.obliterate({ force: true });
      await queue.close();
      await app.close();
    }, 30_000);

    it('serves every registered queue with its counts from GET /api/queues', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/queues' });
      expect(response.statusCode).toBe(200);
      const queues = response.json().queues as AppQueue[];
      expect(queues).toHaveLength(1);
      expect(queues[0]).toMatchObject({
        name: queueName,
        type: 'bullmq',
        counts: expect.objectContaining({ waiting: 2 }),
      });
      expect(queues[0]?.jobs).toEqual([]);
    });

    it('returns the active queue jobs through the REST contract', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/queues?activeQueue=${queueName}&status=waiting&page=1&jobsPerPage=10`,
      });
      expect(response.statusCode).toBe(200);
      const queues = response.json().queues as AppQueue[];
      expect(queues[0]?.jobs.map((job) => job.name)).toEqual(['email', 'email']);
    });

    describe('GET /api/queues/:queueName/jobs', () => {
      it('pages the jobs of a state through the pagination contract', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/api/queues/${queueName}/jobs?status=waiting&page=1&jobsPerPage=1`,
        });
        expect(response.statusCode).toBe(200);

        const body = response.json();
        expect(body.jobs).toHaveLength(1);
        expect(body.jobs[0]).toMatchObject({
          name: 'email',
          state: 'waiting',
          attempts: 0,
        });
        expect(body.pagination).toEqual({ pageCount: 2, range: { start: 0, end: 0 } });
      });

      it('honors the page offset for the next page', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/api/queues/${queueName}/jobs?status=waiting&page=2&jobsPerPage=1`,
        });
        expect(response.statusCode).toBe(200);

        const body = response.json();
        expect(body.jobs).toHaveLength(1);
        expect(body.pagination).toEqual({ pageCount: 2, range: { start: 1, end: 1 } });
        expect(body.jobs[0].id).toBeTruthy();
      });

      it('serves every state the switcher offers', async () => {
        const delayed = await app.inject({
          method: 'GET',
          url: `/api/queues/${queueName}/jobs?status=delayed`,
        });
        expect(delayed.statusCode).toBe(200);
        const delayedJobs = delayed.json().jobs as { name: string }[];
        expect(delayedJobs.map((job) => job.name)).toEqual(['reminder']);

        const failed = await app.inject({
          method: 'GET',
          url: `/api/queues/${queueName}/jobs?status=failed`,
        });
        expect(failed.statusCode).toBe(200);
        expect(failed.json().jobs).toEqual([]);
        expect(failed.json().pagination).toEqual({ pageCount: 0, range: { start: 0, end: 9 } });
      });

      it('lists the waiting jobs under the paused state while the queue is paused', async () => {
        await queue.pause();
        const response = await app.inject({
          method: 'GET',
          url: `/api/queues/${queueName}/jobs?status=paused`,
        });
        await queue.resume();

        expect(response.statusCode).toBe(200);
        const jobs = response.json().jobs as { name: string; state: string }[];
        expect(jobs.map((job) => job.name)).toEqual(['email', 'email']);
        expect(jobs.map((job) => job.state)).toEqual(['paused', 'paused']);
      });

      it('answers unknown queues with 404 and unknown states with 400', async () => {
        const missing = await app.inject({
          method: 'GET',
          url: '/api/queues/not-a-queue/jobs?status=waiting',
        });
        expect(missing.statusCode).toBe(404);
        const nonsense = await app.inject({
          method: 'GET',
          url: `/api/queues/${queueName}/jobs?status=nonsense`,
        });
        expect(nonsense.statusCode).toBe(400);
      });
    });

    describe('GET /api/queues/:queueName/:jobId', () => {
      it('returns the job detail with its data through the REST contract', async () => {
        const [job] = await queue.getJobs(['waiting']);
        const response = await app.inject({
          method: 'GET',
          url: `/api/queues/${queueName}/${job!.id}`,
        });
        expect(response.statusCode).toBe(200);

        expect(response.json().job).toMatchObject({
          id: job!.id,
          name: 'email',
        });
        expect(response.json().job.data).toEqual(job!.data);
        expect(response.json().status).toBe('waiting');
      });

      it('returns the job logs through the REST contract', async () => {
        const [job] = await queue.getJobs(['waiting']);
        await queue.addJobLog(job!.id!, 'http log row');

        const response = await app.inject({
          method: 'GET',
          url: `/api/queues/${queueName}/${job!.id}/logs`,
        });
        expect(response.statusCode).toBe(200);

        const body = response.json();
        expect(body.logs).toEqual(['http log row']);
        expect(body.count).toBe(1);
        expect(body.pagination).toEqual({ pageCount: 1, range: { start: 0, end: 9 } });
      });

      it('pages the job logs through the REST contract', async () => {
        const [delayed] = await queue.getJobs(['delayed']);
        await queue.addJobLog(delayed!.id!, 'http log 1');
        await queue.addJobLog(delayed!.id!, 'http log 2');
        await queue.addJobLog(delayed!.id!, 'http log 3');

        const first = await app.inject({
          method: 'GET',
          url: `/api/queues/${queueName}/${delayed!.id}/logs?page=1&logsPerPage=2`,
        });
        expect(first.statusCode).toBe(200);
        expect(first.json().logs).toEqual(['http log 3', 'http log 2']);
        expect(first.json().count).toBe(3);
        expect(first.json().pagination).toEqual({ pageCount: 2, range: { start: 0, end: 1 } });

        const second = await app.inject({
          method: 'GET',
          url: `/api/queues/${queueName}/${delayed!.id}/logs?page=2&logsPerPage=2`,
        });
        expect(second.statusCode).toBe(200);
        expect(second.json().logs).toEqual(['http log 1']);
        expect(second.json().pagination).toEqual({ pageCount: 2, range: { start: 2, end: 3 } });
      });

      it('keeps the literal jobs list route ahead of the job detail route', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/api/queues/${queueName}/jobs?status=waiting`,
        });
        expect(response.statusCode).toBe(200);
        expect(Array.isArray(response.json().jobs)).toBe(true);
      });

      it('answers unknown jobs with 404', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/api/queues/${queueName}/missing`,
        });
        expect(response.statusCode).toBe(404);
      });
    });

    it('serves the routes under the host-app base path', async () => {
      const serverAdapter = new FastifyAdapter().setBasePath('/board');
      createBullBoard({
        queues: [new BullMQAdapter(queue)],
        serverAdapter,
      });

      const mounted = mountAdapter(serverAdapter, '/board');
      await mounted.ready();

      const response = await mounted.inject({ method: 'GET', url: '/board/api/queues' });
      expect(response.statusCode).toBe(200);
      const queues = response.json().queues as AppQueue[];
      expect(queues).toHaveLength(1);
      await mounted.close();
    });
  });

  describe('mutation routes through the REST contract', () => {
    const queueName = `bullmq-dash-fastify-actions-${randomUUID()}`;
    let queue: Queue;
    let app: FastifyInstance;

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

      const serverAdapter = new FastifyAdapter();
      createBullBoard({
        queues: [new BullMQAdapter(queue)],
        serverAdapter,
      });

      app = mountAdapter(serverAdapter);
      await app.ready();
    }, 30_000);

    afterAll(async () => {
      await queue.obliterate({ force: true });
      await queue.close();
      await app.close();
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
      const response = await app.inject({
        method: 'PUT',
        url: `/api/queues/${queueName}/${jobId}/retry`,
      });
      expect(response.statusCode).toBe(204);
      expect(await (await queue.getJob(jobId))?.getState()).toBe('waiting');
    });

    it('promotes a delayed job from its endpoint', async () => {
      const jobId = await jobIdOf('later');
      const response = await app.inject({
        method: 'PUT',
        url: `/api/queues/${queueName}/${jobId}/promote`,
      });
      expect(response.statusCode).toBe(204);
      expect(await (await queue.getJob(jobId))?.getState()).toBe('waiting');
    });

    it('removes a job from its endpoint', async () => {
      const jobId = await jobIdOf('wait');
      const response = await app.inject({
        method: 'PUT',
        url: `/api/queues/${queueName}/${jobId}/remove`,
      });
      expect(response.statusCode).toBe(204);
      expect(await queue.getJob(jobId)).toBeUndefined();
    });

    it('removes a job from its bull-board clean alias', async () => {
      const job = await queue.add('wait', { index: 6 });
      const response = await app.inject({
        method: 'PUT',
        url: `/api/queues/${queueName}/${job.id}/clean`,
      });
      expect(response.statusCode).toBe(204);
      expect(await queue.getJob(job.id!)).toBeUndefined();
    });

    it('retries every failed job in bulk', async () => {
      const worker = new Worker(queueName, async () => Promise.reject(new Error('boom')), {
        connection,
      });
      await queue.add('fail-me', { index: 4 });
      await pollUntil(async () => (await queue.getJobCountByTypes('failed')) > 0, 10_000);
      await worker.close();

      const response = await app.inject({
        method: 'PUT',
        url: `/api/queues/${queueName}/retry/failed`,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().retried).toBeGreaterThanOrEqual(1);
      expect(await queue.getJobCountByTypes('failed')).toBe(0);
    });

    it('rejects a non-retriable bulk status', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/queues/${queueName}/retry/waiting`,
      });
      expect(response.statusCode).toBe(400);
    });

    it('pauses and resumes the queue', async () => {
      const paused = await app.inject({
        method: 'PUT',
        url: `/api/queues/${queueName}/pause`,
      });
      expect(paused.statusCode).toBe(200);
      expect(await queue.isPaused()).toBe(true);
      const resumed = await app.inject({
        method: 'PUT',
        url: `/api/queues/${queueName}/resume`,
      });
      expect(resumed.statusCode).toBe(200);
      expect(await queue.isPaused()).toBe(false);
    });

    it('empties the waiting jobs', async () => {
      await queue.add('wait', { index: 5 });
      const response = await app.inject({
        method: 'PUT',
        url: `/api/queues/${queueName}/empty`,
      });
      expect(response.statusCode).toBe(200);
      expect(await queue.getJobCountByTypes('waiting')).toBe(0);
    });

    it('cleans the completed jobs older than the grace period', async () => {
      const worker = new Worker(queueName, async () => 'result', { connection });
      const done = await queue.add('done', { index: 6 });
      await pollUntil(async () => (await done.isCompleted()), 10_000);
      await worker.close();

      const response = await app.inject({
        method: 'PUT',
        url: `/api/queues/${queueName}/clean/completed?grace=0`,
      });
      expect(response.statusCode).toBe(200);
      expect(await queue.getJobCountByTypes('completed')).toBe(0);
    });
  });

  describe('search routes through the REST contract', () => {
    const queueName = `bullmq-dash-fastify-search-${randomUUID()}`;
    const secondQueueName = `bullmq-dash-fastify-search-2-${randomUUID()}`;
    const cappedQueueName = `bullmq-dash-fastify-search-cap-${randomUUID()}`;
    let queue: Queue;
    let secondQueue: Queue;
    let cappedQueue: Queue;
    let app: FastifyInstance;

    beforeAll(async () => {
      queue = new Queue(queueName, { connection });
      secondQueue = new Queue(secondQueueName, { connection });
      cappedQueue = new Queue(cappedQueueName, { connection });

      await queue.add('mail-job', { to: 'a@example.com' }, { jobId: 'mail-1' });
      await queue.add('later-mail', { to: 'later@example.com' }, { jobId: 'mail-later', delay: 60_000 });
      await secondQueue.add('welcome-job', { to: 'c@example.com' }, { jobId: 'bill-1' });
      await seedQueueJobs(cappedQueue, 'capped', 505);

      const serverAdapter = new FastifyAdapter();
      createBullBoard({
        queues: [
          new BullMQAdapter(queue),
          new BullMQAdapter(secondQueue),
          new BullMQAdapter(cappedQueue),
        ],
        serverAdapter,
      });

      app = mountAdapter(serverAdapter);
      await app.ready();
    }, 60_000);

    afterAll(async () => {
      await queue.obliterate({ force: true });
      await secondQueue.obliterate({ force: true });
      await cappedQueue.obliterate({ force: true });
      await queue.close();
      await secondQueue.close();
      await cappedQueue.close();
      await app.close();
    }, 60_000);

    it('matches jobs by a partial id across every queue', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/search?term=mail-' });
      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.term).toBe('mail-');
      expect(body.count).toBe(2);
      expect(body.deepen).toBe(false);
      expect(body.results.map((result: { job: { id: string } }) => result.job.id).sort()).toEqual([
        'mail-1',
        'mail-later',
      ]);
      expect(body.results.map((result: { queue: string }) => result.queue)).toEqual([
        queueName,
        queueName,
      ]);
    });

    it('matches job names case-insensitively', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/search?term=WELCOME' });
      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.results).toHaveLength(1);
      expect(body.results[0]).toMatchObject({
        queue: secondQueueName,
        job: { id: 'bill-1', name: 'welcome-job' },
        state: 'waiting',
      });
    });

    it('filters matches by the state chips', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/search?term=mail&status=delayed' });
      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.results.map((result: { job: { id: string } }) => result.job.id)).toEqual([
        'mail-later',
      ]);
      expect(body.results[0].state).toBe('delayed');
    });

    it('scopes the search inside a queue and 404s unknown queues', async () => {
      const scoped = await app.inject({
        method: 'GET',
        url: `/api/queues/${queueName}/search?term=bill`,
      });
      expect(scoped.statusCode).toBe(200);
      expect(scoped.json().results).toEqual([]);

      const missing = await app.inject({
        method: 'GET',
        url: '/api/queues/not-a-queue/search?term=mail',
      });
      expect(missing.statusCode).toBe(404);
    });

    it('caps results at 500 with a deepen continuation', async () => {
      const first = await app.inject({ method: 'GET', url: '/api/search?term=capped-' });
      expect(first.statusCode).toBe(200);
      expect(first.json().count).toBe(500);
      expect(first.json().results).toHaveLength(500);
      expect(first.json().deepen).toBe(true);

      const continued = await app.inject({
        method: 'GET',
        url: `/api/search?term=capped-&start=${first.json().totalScanned}`,
      });
      expect(continued.statusCode).toBe(200);
      expect(continued.json().count).toBe(5);
      expect(continued.json().deepen).toBe(false);
    });

    it('rejects a missing term and an unknown state', async () => {
      const missingTerm = await app.inject({ method: 'GET', url: '/api/search' });
      expect(missingTerm.statusCode).toBe(400);
      const nonsenseState = await app.inject({ method: 'GET', url: '/api/search?term=mail&status=nonsense' });
      expect(nonsenseState.statusCode).toBe(400);
    });
  });

  describe('readOnly board', () => {
    const queueName = `bullmq-dash-fastify-readonly-${randomUUID()}`;
    let queue: Queue;
    let app: FastifyInstance;

    beforeAll(async () => {
      queue = new Queue(queueName, { connection });
      await queue.add('wait', { index: 1 });

      const serverAdapter = new FastifyAdapter();
      createBullBoard({
        queues: [new BullMQAdapter(queue)],
        serverAdapter,
        options: { readOnly: true },
      });

      app = mountAdapter(serverAdapter);
      await app.ready();
    }, 30_000);

    afterAll(async () => {
      await queue.obliterate({ force: true });
      await queue.close();
      await app.close();
    }, 30_000);

    it('marks every queue read-only in the queues response', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/queues' });
      expect(response.statusCode).toBe(200);
      const queues = response.json().queues as AppQueue[];
      expect(queues[0]?.readOnlyMode).toBe(true);
    });

    it('blocks every mutation with a 403', async () => {
      await app.inject({ method: 'PUT', url: `/api/queues/${queueName}/pause` }).then((r) => expect(r.statusCode).toBe(403));
      await app.inject({ method: 'PUT', url: `/api/queues/${queueName}/resume` }).then((r) => expect(r.statusCode).toBe(403));
      await app.inject({ method: 'PUT', url: `/api/queues/${queueName}/empty` }).then((r) => expect(r.statusCode).toBe(403));
      await app.inject({ method: 'PUT', url: `/api/queues/${queueName}/retry/failed` }).then((r) => expect(r.statusCode).toBe(403));
      await app.inject({ method: 'PUT', url: `/api/queues/${queueName}/promote` }).then((r) => expect(r.statusCode).toBe(403));
      await app.inject({ method: 'PUT', url: `/api/queues/${queueName}/clean/completed` }).then((r) => expect(r.statusCode).toBe(403));
      await app.inject({ method: 'PUT', url: `/api/queues/${queueName}/remove/failed` }).then((r) => expect(r.statusCode).toBe(403));

      const [job] = await queue.getJobs(['waiting']);
      await app.inject({ method: 'PUT', url: `/api/queues/${queueName}/${job!.id}/retry` }).then((r) => expect(r.statusCode).toBe(403));
      await app.inject({ method: 'PUT', url: `/api/queues/${queueName}/${job!.id}/promote` }).then((r) => expect(r.statusCode).toBe(403));
      await app.inject({ method: 'PUT', url: `/api/queues/${queueName}/${job!.id}/clean` }).then((r) => expect(r.statusCode).toBe(403));
      await app.inject({ method: 'PUT', url: `/api/queues/${queueName}/${job!.id}/remove` }).then((r) => expect(r.statusCode).toBe(403));

      expect(await queue.isPaused()).toBe(false);
      expect(await queue.getJobCountByTypes('waiting')).toBe(1);
    });
  });

  describe('as a fluent adapter', () => {
    const configDir = (): string => {
      const dir = mkdtempSync(join(tmpdir(), 'bullmq-dash-fastify-'));
      mkdirSync(join(dir, 'assets'));
      writeFileSync(join(dir, 'board.ejs'), '<h1><%= title %></h1>');
      return dir;
    };

    it('returns itself from setBasePath and a plugin from registerPlugin', () => {
      const adapter = new FastifyAdapter();
      expect(adapter.setBasePath('/board')).toBe(adapter);
      expect(typeof adapter.registerPlugin()).toBe('function');
    });

    it('throws until every piece of config is set before registerPlugin', async () => {
      const dir = configDir();
      const adapter = new FastifyAdapter();

      const expectRegistrationError = async (message: string) => {
        const app = Fastify();
        app.register(adapter.registerPlugin());
        await expect(app.ready()).rejects.toThrow(message);
      };

      await expectRegistrationError(`Please call 'setStaticPath' before using 'registerPlugin'`);
      adapter.setStaticPath('/assets', join(dir, 'assets'));
      await expectRegistrationError(`Please call 'setEntryRoute' before using 'registerPlugin'`);
      adapter.setEntryRoute({
        method: 'get',
        route: '/',
        handler: () => ({ name: 'board', params: { title: 'Hello Board' } }),
      });
      await expectRegistrationError(`Please call 'setViewsPath' before using 'registerPlugin'`);
      adapter.setViewsPath(dir);
      await expectRegistrationError(`Please call 'setApiRoutes' before using 'registerPlugin'`);
      adapter.setApiRoutes([]);
      await expectRegistrationError(`Please call 'setQueues' before using 'registerPlugin'`);
      adapter.setQueues(new Map());
      await expectRegistrationError(`Please call 'setErrorHandler' before using 'registerPlugin'`);
      adapter.setErrorHandler(() => ({ status: 500, body: 'error' }));

      rmSync(dir, { recursive: true, force: true });
    });

    it('registers routes with array methods and array routes', async () => {
      const dir = configDir();
      const adapter = new FastifyAdapter();
      adapter.setViewsPath(dir);
      adapter.setStaticPath('/assets', join(dir, 'assets'));
      adapter.setEntryRoute({
        method: 'get',
        route: '/',
        handler: () => ({ name: 'board', params: { title: 'Hello Board' } }),
      });
      adapter.setQueues(new Map());
      adapter.setErrorHandler(() => ({ status: 500, body: 'error' }));
      adapter.setApiRoutes([
        {
          method: ['get', 'put'],
          route: '/api/dual',
          handler: () => ({ body: { ok: true } }),
        },
        {
          method: 'get',
          route: ['/api/a', '/api/b'],
          handler: () => ({ body: { ok: true } }),
        },
      ]);

      const app = mountAdapter(adapter);
      await app.ready();

      const dualGet = await app.inject({ method: 'GET', url: '/api/dual' });
      expect(dualGet.statusCode).toBe(200);
      expect(dualGet.json()).toEqual({ ok: true });
      const dualPut = await app.inject({ method: 'PUT', url: '/api/dual' });
      expect(dualPut.statusCode).toBe(200);
      const a = await app.inject({ method: 'GET', url: '/api/a' });
      expect(a.json()).toEqual({ ok: true });
      const b = await app.inject({ method: 'GET', url: '/api/b' });
      expect(b.json()).toEqual({ ok: true });

      await app.close();
      rmSync(dir, { recursive: true, force: true });
    });

    it('bridges handler failures through the error handler', async () => {
      const dir = configDir();
      const adapter = new FastifyAdapter();
      adapter.setViewsPath(dir);
      adapter.setStaticPath('/assets', join(dir, 'assets'));
      adapter.setEntryRoute({
        method: 'get',
        route: '/',
        handler: () => ({ name: 'board', params: { title: 'Hello Board' } }),
      });
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

      const app = mountAdapter(adapter);
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/api/broken' });
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: 'Queue error', details: 'boom' });

      await app.close();
      rmSync(dir, { recursive: true, force: true });
    });
  });

  describe('views and static assets', () => {
    let dir: string;
    let app: FastifyInstance;

    beforeAll(async () => {
      dir = mkdtempSync(join(tmpdir(), 'bullmq-dash-fastify-'));
      mkdirSync(join(dir, 'static'));
      writeFileSync(join(dir, 'static', 'asset.txt'), 'asset-content');
      writeFileSync(join(dir, 'board.ejs'), '<h1><%= title %></h1>');

      const adapter = new FastifyAdapter();
      adapter.setViewsPath(dir);
      adapter.setStaticPath('/static', join(dir, 'static'));
      adapter.setEntryRoute({
        method: 'get',
        route: '/',
        handler: () => ({ name: 'board', params: { title: 'Hello Board' } }),
      });
      adapter.setQueues(new Map());
      adapter.setErrorHandler(() => ({ status: 500, body: 'error' }));
      adapter.setApiRoutes([]);

      app = mountAdapter(adapter);
      await app.ready();
    });

    afterAll(async () => {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    });

    it('serves static assets', async () => {
      const response = await app.inject({ method: 'GET', url: '/static/asset.txt' });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('asset-content');
    });

    it('renders the entry route view', async () => {
      const response = await app.inject({ method: 'GET', url: '/' });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('Hello Board');
    });
  });
});

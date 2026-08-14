import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BullMQAdapter, type AppQueue, type BoardOptions } from '@bullmq-dash/api';
import { ExpressAdapter } from '@bullmq-dash/express';
import { FastifyAdapter } from '@bullmq-dash/fastify';
import { getQueueToken } from '@nestjs/bull-shared';
import { BullModule } from '@nestjs/bullmq';
import {
  RequestMethod,
  type DynamicModule,
  type INestApplication,
  type Provider,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter as NestFastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Queue } from 'bullmq';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BullBoardModule,
  type BullBoardModuleOptions,
  type BullBoardQueueOptions,
} from './index';

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
};

const uiDist = resolve(process.cwd(), '../ui/dist');

async function createApp(options: {
  route: string;
  adapter: new () => ExpressAdapter | FastifyAdapter;
  boardOptions?: BoardOptions;
  middleware?: unknown;
  queues?: BullBoardQueueOptions[];
  providers?: Provider[];
  globalPrefix?: { prefix: string; exclude?: { path: string; method: RequestMethod }[] };
}): Promise<INestApplication> {
  const { route, adapter, queues, providers } = options;
  const forRootOptions: BullBoardModuleOptions = { route, adapter };
  if (options.boardOptions !== undefined) {
    forRootOptions.boardOptions = options.boardOptions;
  }
  if (options.middleware !== undefined) {
    forRootOptions.middleware = options.middleware;
  }

  const appModule: DynamicModule = {
    module: class DashboardAppModule {},
    imports: [
      BullBoardModule.forRoot(forRootOptions),
      BullBoardModule.forFeature(...(queues ?? [])),
    ],
    ...(providers ? { providers } : {}),
  };

  const app = await NestFactory.create(appModule, { logger: false });
  if (options.globalPrefix) {
    const prefixOptions: { exclude?: { path: string; method: RequestMethod }[] } = {};
    if (options.globalPrefix.exclude) {
      prefixOptions.exclude = options.globalPrefix.exclude;
    }
    app.setGlobalPrefix(options.globalPrefix.prefix, prefixOptions);
  }
  await app.init();
  return app;
}

describe('BullBoardModule', () => {
  describe('embedded in a Nest app over Express', () => {
    const queueName = `bullmq-dash-nestjs-${randomUUID()}`;
    let queue: Queue;
    let app: INestApplication;

    beforeAll(async () => {
      queue = new Queue(queueName, { connection });
      await queue.add('email', { to: 'a@example.com' });
      await queue.add('email', { to: 'b@example.com' });
      await queue.add('reminder', { to: 'later@example.com' }, { delay: 60_000 });

      app = await createApp({
        route: '/board',
        adapter: ExpressAdapter,
        queues: [{ name: queueName, adapter: BullMQAdapter }],
        providers: [{ provide: getQueueToken(queueName), useValue: queue }],
      });
    }, 30_000);

    afterAll(async () => {
      await app.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }, 30_000);

    it('serves every registered queue with its counts from GET /board/api/queues', async () => {
      const response = await request(app.getHttpServer()).get('/board/api/queues').expect(200);
      const queues = response.body.queues as AppQueue[];
      expect(queues).toHaveLength(1);
      expect(queues[0]).toMatchObject({
        name: queueName,
        type: 'bullmq',
        counts: expect.objectContaining({ waiting: 2 }),
      });
    });

    it('returns the active queue jobs through the REST contract', async () => {
      const response = await request(app.getHttpServer())
        .get('/board/api/queues')
        .query({ activeQueue: queueName, status: 'waiting', page: 1, jobsPerPage: 10 })
        .expect(200);
      const queues = response.body.queues as AppQueue[];
      expect(queues[0]?.jobs.map((job) => job.name)).toEqual(['email', 'email']);
    });

    it('pages the jobs of a state through the pagination contract', async () => {
      const response = await request(app.getHttpServer())
        .get(`/board/api/queues/${queueName}/jobs`)
        .query({ status: 'waiting', page: 1, jobsPerPage: 1 })
        .expect(200);

      expect(response.body.jobs).toHaveLength(1);
      expect(response.body.pagination).toEqual({ pageCount: 2, range: { start: 0, end: 0 } });
    });

    it('returns the job detail and its logs through the REST contract', async () => {
      const [job] = await queue.getJobs(['waiting']);
      await queue.addJobLog(job!.id!, 'http log row');

      const detail = await request(app.getHttpServer())
        .get(`/board/api/queues/${queueName}/${job!.id}`)
        .expect(200);
      expect(detail.body.job).toMatchObject({ id: job!.id, name: 'email' });
      expect(detail.body.status).toBe('waiting');

      const logs = await request(app.getHttpServer())
        .get(`/board/api/queues/${queueName}/${job!.id}/logs`)
        .expect(200);
      expect(logs.body.logs).toEqual(['http log row']);
      expect(logs.body.count).toBe(1);
    });

    it('searches across the registered queues', async () => {
      const response = await request(app.getHttpServer())
        .get('/board/api/search')
        .query({ term: 'reminder' })
        .expect(200);
      expect(response.body.count).toBe(1);
      expect(response.body.results[0]).toMatchObject({
        queue: queueName,
        job: { name: 'reminder' },
        state: 'delayed',
      });
    });

    it('answers unknown queues with 404 through the REST contract', async () => {
      await request(app.getHttpServer())
        .get('/board/api/queues/not-a-queue/jobs')
        .query({ status: 'waiting' })
        .expect(404);
    });

    it('serves the SPA entry under the route with the base href and injected uiConfig', async () => {
      const response = await request(app.getHttpServer()).get('/board/').expect(200);
      expect(response.text).toContain('id="root"');
      expect(response.text).toContain('__UI_CONFIG__');
      expect(response.text).toContain('<base href="/board/">');
    });

    it('injects the board options into the SPA entry', async () => {
      const withTitle = await createApp({
        route: '/board',
        adapter: ExpressAdapter,
        boardOptions: { uiConfig: { boardTitle: 'Ops Board' } },
      });
      const response = await request(withTitle.getHttpServer()).get('/board/').expect(200);
      expect(response.text).toContain('Ops Board');
      await withTitle.close();
    });

    it('serves the built static assets under the route', async () => {
      const html = readFileSync(resolve(uiDist, 'index.html'), 'utf8');
      const assetRef = html.match(/\.\/assets\/[^"']+\.js/)?.[0];
      expect(assetRef, 'built html should reference a hashed asset').toBeTruthy();
      await request(app.getHttpServer())
        .get(`/board${assetRef!.replace(/^\./, '')}`)
        .expect(200);
    });
  });

  describe('mutation routes through the REST contract', () => {
    const queueName = `bullmq-dash-nestjs-actions-${randomUUID()}`;
    let queue: Queue;
    let app: INestApplication;

    beforeAll(async () => {
      queue = new Queue(queueName, { connection });
      await queue.add('wait', { index: 1 });

      app = await createApp({
        route: '/board',
        adapter: ExpressAdapter,
        queues: [{ name: queueName, adapter: BullMQAdapter }],
        providers: [{ provide: getQueueToken(queueName), useValue: queue }],
      });
    }, 30_000);

    afterAll(async () => {
      await app.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }, 30_000);

    it('pauses and resumes the queue', async () => {
      await request(app.getHttpServer()).put(`/board/api/queues/${queueName}/pause`).expect(200);
      expect(await queue.isPaused()).toBe(true);
      await request(app.getHttpServer()).put(`/board/api/queues/${queueName}/resume`).expect(200);
      expect(await queue.isPaused()).toBe(false);
    });

    it('removes a job from its endpoint', async () => {
      const job = await queue.add('wait', { index: 2 });
      await request(app.getHttpServer())
        .put(`/board/api/queues/${queueName}/${job.id}/remove`)
        .expect(204);
      expect(await queue.getJob(job.id!)).toBeUndefined();
    });
  });

  describe('readOnly board', () => {
    const queueName = `bullmq-dash-nestjs-readonly-${randomUUID()}`;
    let queue: Queue;
    let app: INestApplication;

    beforeAll(async () => {
      queue = new Queue(queueName, { connection });
      await queue.add('wait', { index: 1 });

      app = await createApp({
        route: '/board',
        adapter: ExpressAdapter,
        boardOptions: { readOnly: true },
        queues: [{ name: queueName, adapter: BullMQAdapter }],
        providers: [{ provide: getQueueToken(queueName), useValue: queue }],
      });
    }, 30_000);

    afterAll(async () => {
      await app.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }, 30_000);

    it('marks every queue read-only in the queues response', async () => {
      const response = await request(app.getHttpServer()).get('/board/api/queues').expect(200);
      const queues = response.body.queues as AppQueue[];
      expect(queues[0]?.readOnlyMode).toBe(true);
    });

    it('blocks every mutation with a 403', async () => {
      await request(app.getHttpServer()).put(`/board/api/queues/${queueName}/pause`).expect(403);
      await request(app.getHttpServer()).put(`/board/api/queues/${queueName}/empty`).expect(403);
      await request(app.getHttpServer())
        .put(`/board/api/queues/${queueName}/retry/failed`)
        .expect(403);
      expect(await queue.isPaused()).toBe(false);
    });
  });

  describe('module registration and routing', () => {
    it('runs the configured middleware before the dashboard', async () => {
      const queue = new Queue(`bullmq-dash-nestjs-mw-${randomUUID()}`, { connection });
      const app = await createApp({
        route: '/board',
        adapter: ExpressAdapter,
        middleware: (req: { headers: Record<string, string> }, res: { status: (code: number) => { send: (body: string) => void } }, next: () => void) =>
          req.headers['x-dash-key'] === 'secret' ? next() : res.status(401).send('unauthorized'),
        providers: [{ provide: getQueueToken('unused'), useValue: queue }],
      });
      await request(app.getHttpServer()).get('/board/api/queues').expect(401);
      const allowed = await request(app.getHttpServer())
        .get('/board/api/queues')
        .set('x-dash-key', 'secret')
        .expect(200);
      expect(allowed.body.queues).toEqual([]);
      await app.close();
      await queue.obliterate({ force: true });
      await queue.close();
    });

    it('serves the dashboard under the app global prefix', async () => {
      const queue = new Queue(`bullmq-dash-nestjs-prefix-${randomUUID()}`, { connection });
      const app = await createApp({
        route: '/board',
        adapter: ExpressAdapter,
        globalPrefix: { prefix: 'api' },
        providers: [{ provide: getQueueToken('unused'), useValue: queue }],
      });

      await request(app.getHttpServer()).get('/api/board/api/queues').expect(200);
      const entry = await request(app.getHttpServer()).get('/api/board/').expect(200);
      expect(entry.text).toContain('<base href="/api/board/">');
      await app.close();
      await queue.obliterate({ force: true });
      await queue.close();
    });

    it('serves the dashboard unprefixed when its route is excluded from the global prefix', async () => {
      const queue = new Queue(`bullmq-dash-nestjs-excl-${randomUUID()}`, { connection });
      const app = await createApp({
        route: '/board',
        adapter: ExpressAdapter,
        globalPrefix: {
          prefix: 'api',
          exclude: [{ path: '/board', method: RequestMethod.ALL }],
        },
        providers: [{ provide: getQueueToken('unused'), useValue: queue }],
      });

      await request(app.getHttpServer()).get('/board/api/queues').expect(200);
      const entry = await request(app.getHttpServer()).get('/board/').expect(200);
      expect(entry.text).toContain('<base href="/board/">');
      await app.close();
      await queue.obliterate({ force: true });
      await queue.close();
    });

    it('boots the same surface through forRootAsync', async () => {
      const queueName = `bullmq-dash-nestjs-async-${randomUUID()}`;
      const queue = new Queue(queueName, { connection });
      const appModule: DynamicModule = {
        module: class DashboardAppModule {},
        imports: [
          BullBoardModule.forRootAsync({
            useFactory: () => ({ route: '/async', adapter: ExpressAdapter }),
          }),
          BullBoardModule.forFeature({ name: queueName, adapter: BullMQAdapter }),
        ],
        providers: [{ provide: getQueueToken(queueName), useValue: queue }],
      };
      const app = await NestFactory.create(appModule, { logger: false });
      await app.init();

      const response = await request(app.getHttpServer()).get('/async/api/queues').expect(200);
      expect(response.body.queues).toHaveLength(1);
      const entry = await request(app.getHttpServer()).get('/async/').expect(200);
      expect(entry.text).toContain('<base href="/async/">');

      await app.close();
      await queue.obliterate({ force: true });
      await queue.close();
    });
  });

  describe('forFeature queue registration', () => {
    it('registers a queue instance passed directly', async () => {
      const queueName = `bullmq-dash-nestjs-instance-${randomUUID()}`;
      const queue = new Queue(queueName, { connection: { host: 'localhost', port: 6379 } });
      await queue.add('wait', { index: 1 });

      const app = await createApp({
        route: '/board',
        adapter: ExpressAdapter,
        queues: [{ queue, adapter: BullMQAdapter }],
      });

      const response = await request(app.getHttpServer()).get('/board/api/queues').expect(200);
      const queues = response.body.queues as AppQueue[];
      expect(queues).toHaveLength(1);
      expect(queues[0]?.counts).toEqual(expect.objectContaining({ waiting: 1 }));

      await app.close();
      await queue.obliterate({ force: true });
      await queue.close();
    });

    it('passes per-queue adapter options through to the adapter', async () => {
      const queueName = `bullmq-dash-nestjs-options-${randomUUID()}`;
      const queue = new Queue(queueName, { connection: { host: 'localhost', port: 6379 } });
      await queue.add('wait', { index: 1 });

      const app = await createApp({
        route: '/board',
        adapter: ExpressAdapter,
        queues: [{ name: queueName, adapter: BullMQAdapter, options: { readOnlyMode: true } }],
        providers: [{ provide: getQueueToken(queueName), useValue: queue }],
      });

      const response = await request(app.getHttpServer()).get('/board/api/queues').expect(200);
      const queues = response.body.queues as AppQueue[];
      expect(queues[0]?.readOnlyMode).toBe(true);
      await request(app.getHttpServer()).put(`/board/api/queues/${queueName}/pause`).expect(403);

      await app.close();
      await queue.obliterate({ force: true });
      await queue.close();
    });

    it('resolves queues registered through @nestjs/bullmq by name', async () => {
      const queueName = `bullmq-dash-nestjs-bullmq-${randomUUID()}`;
      const appModule: DynamicModule = {
        module: class DashboardAppModule {},
        imports: [
          BullModule.forRoot({ connection }),
          BullModule.registerQueue({ name: queueName }),
          BullBoardModule.forRoot({ route: '/board', adapter: ExpressAdapter }),
          BullBoardModule.forFeature({ name: queueName, adapter: BullMQAdapter }),
        ],
      };
      const app = await NestFactory.create(appModule, { logger: false });
      await app.init();

      const response = await request(app.getHttpServer()).get('/board/api/queues').expect(200);
      const queues = response.body.queues as AppQueue[];
      expect(queues).toHaveLength(1);
      expect(queues[0]?.name).toBe(queueName);

      // Obliterate and close the queue before the app: @nestjs/bullmq wires
      // `queue.close()` into the app shutdown hook, so `app.close()` first
      // would leave the obliterate call on a closed connection.
      const queue = app.get<Queue>(getQueueToken(queueName));
      await queue.obliterate({ force: true });
      await queue.close();
      await app.close();
    });
  });

  describe('embedded in a Nest app over Fastify', () => {
    const queueName = `bullmq-dash-nestjs-fastify-${randomUUID()}`;
    let queue: Queue;
    let app: NestFastifyApplication;

    beforeAll(async () => {
      queue = new Queue(queueName, { connection });
      await queue.add('email', { to: 'a@example.com' });

      const appModule: DynamicModule = {
        module: class DashboardAppModule {},
        imports: [
          BullBoardModule.forRoot({ route: '/board', adapter: FastifyAdapter }),
          BullBoardModule.forFeature({ name: queueName, adapter: BullMQAdapter }),
        ],
        providers: [{ provide: getQueueToken(queueName), useValue: queue }],
      };

      app = await NestFactory.create<NestFastifyApplication>(
        appModule,
        new NestFastifyAdapter(),
        { logger: false }
      );
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
    }, 30_000);

    afterAll(async () => {
      await app.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }, 30_000);

    it('serves the queues API through the Nest host', async () => {
      const response = await app.inject({ method: 'GET', url: '/board/api/queues' });
      expect(response.statusCode).toBe(200);
      const queues = response.json().queues as AppQueue[];
      expect(queues).toHaveLength(1);
      expect(queues[0]?.name).toBe(queueName);
    });

    it('serves the SPA entry under the route', async () => {
      const response = await app.inject({ method: 'GET', url: '/board/' });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('__UI_CONFIG__');
      expect(response.body).toContain('<base href="/board/">');
    });
  });
});

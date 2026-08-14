import { Queue } from 'bullmq';
import Redis from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StandaloneConfig } from './config';
import { startStandaloneServer, type StandaloneServerHandle } from './server';

const PREFIX = `srv-${process.pid}-${Date.now()}`;
const redisOptions = () => ({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
});

const handles: StandaloneServerHandle[] = [];
let client: Redis;

function testConfig(overrides: Partial<StandaloneConfig> = {}): StandaloneConfig {
  return {
    host: '127.0.0.1',
    port: 0,
    redis: { ...redisOptions(), password: undefined, db: 0, prefix: PREFIX },
    queues: undefined,
    ...overrides,
  };
}

beforeAll(async () => {
  client = new Redis(redisOptions());
  await client.ping();

  const emails = new Queue('srv-emails', { connection: redisOptions(), prefix: PREFIX });
  const reports = new Queue('srv-reports', { connection: redisOptions(), prefix: PREFIX });
  await emails.add('welcome', { to: 'a@example.com' });
  await reports.add('daily', { date: '2026-08-14' });
  await Promise.all([emails.close(), reports.close()]);
});

afterAll(async () => {
  await Promise.all(handles.map((handle) => handle.close()));
  const keys = await client.keys(`${PREFIX}:*`);
  if (keys.length > 0) {
    await client.del(...keys);
  }
  await client.quit();
});

describe('startStandaloneServer', () => {
  it('boots a dashboard server listing every queue on the connection', async () => {
    const handle = await startStandaloneServer(testConfig());
    handles.push(handle);

    const response = await request(handle.server).get('/api/queues').expect(200);
    const names = (response.body.queues as { name: string }[]).map((queue) => queue.name);

    expect(names).toEqual(['srv-emails', 'srv-reports']);
  });

  it('serves the SPA entry on /', async () => {
    const handle = await startStandaloneServer(testConfig());
    handles.push(handle);

    const response = await request(handle.server).get('/').expect(200);
    expect(response.text).toContain('id="root"');
    expect(response.text).toContain('__UI_CONFIG__');
  });

  it('shows only the allow-listed queues', async () => {
    const handle = await startStandaloneServer(testConfig({ queues: ['srv-reports', 'missing'] }));
    handles.push(handle);

    const response = await request(handle.server).get('/api/queues').expect(200);
    const names = (response.body.queues as { name: string }[]).map((queue) => queue.name);

    expect(names).toEqual(['srv-reports']);
  });

  it('reports the bound url, resolving ephemeral ports', async () => {
    const handle = await startStandaloneServer(testConfig());
    handles.push(handle);

    expect(handle.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    await request(handle.url).get('/api/queues').expect(200);
  });

  it('serves mutations enabled by default (not read-only)', async () => {
    const handle = await startStandaloneServer(testConfig());
    handles.push(handle);

    await request(handle.server).put('/api/queues/srv-emails/pause').expect(200);
    await request(handle.server).put('/api/queues/srv-emails/resume').expect(200);
  });

  it('rejects an unreachable Redis with a clear error', async () => {
    await expect(
      startStandaloneServer(
        testConfig({ redis: { ...redisOptions(), password: undefined, db: 0, prefix: PREFIX, port: 1 } })
      )
    ).rejects.toThrow();
  });
});

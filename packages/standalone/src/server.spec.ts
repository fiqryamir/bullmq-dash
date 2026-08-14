import Redis from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StandaloneConfig } from './config';
import { startStandaloneServer, type StandaloneServerHandle } from './server';
import { clearKeys, connectRedis, redisOptions, seedQueues, uniquePrefix } from './testUtils/redis';

const PREFIX = uniquePrefix('srv');

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
  client = await connectRedis();
  await seedQueues(PREFIX, [
    { name: 'srv-emails', jobs: [{ name: 'welcome', data: { to: 'a@example.com' } }] },
    { name: 'srv-reports', jobs: [{ name: 'daily', data: { date: '2026-08-14' } }] },
  ]);
});

afterAll(async () => {
  await Promise.all(handles.map((handle) => handle.close()));
  await clearKeys(client, PREFIX);
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

  it('shows exactly the allow-listed queues, including ones with no keys yet', async () => {
    const handle = await startStandaloneServer(testConfig({ queues: ['srv-reports', 'fresh'] }));
    handles.push(handle);

    const response = await request(handle.server).get('/api/queues').expect(200);
    const names = (response.body.queues as { name: string }[]).map((queue) => queue.name);

    expect(names).toEqual(['fresh', 'srv-reports']);
  });

  it('shows no queues for an empty allow-list', async () => {
    const handle = await startStandaloneServer(testConfig({ queues: [] }));
    handles.push(handle);

    const response = await request(handle.server).get('/api/queues').expect(200);
    expect(response.body.queues).toEqual([]);
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

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Redis from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { main } from './cli';
import type { StandaloneServerHandle } from './server';
import { clearKeys, connectRedis, seedQueues, uniquePrefix } from './testUtils/redis';

const PREFIX = uniquePrefix('cli');

const handles: StandaloneServerHandle[] = [];
let client: Redis;

beforeAll(async () => {
  client = await connectRedis();
  await seedQueues(PREFIX, [
    { name: 'cli-emails', jobs: [{ name: 'welcome', data: { to: 'a@example.com' } }] },
    { name: 'cli-reports', jobs: [{ name: 'daily', data: { date: '2026-08-14' } }] },
  ]);
});

afterAll(async () => {
  await Promise.all(handles.map((handle) => handle.close()));
  await clearKeys(client, PREFIX);
  await client.quit();
});

async function queueNames(handle: StandaloneServerHandle): Promise<string[]> {
  const response = await request(handle.url).get('/api/queues').expect(200);
  return (response.body.queues as { name: string }[]).map((queue) => queue.name);
}

describe('the bullmq-dash CLI', () => {
  it('boots with zero config: defaults host, port 3000, and every queue', async () => {
    const handle = await main([], {});
    expect(handle).not.toBeNull();
    handles.push(handle!);

    expect(handle!.url).toBe('http://localhost:3000');
    await request(handle!.url).get('/api/queues').expect(200);
  });

  it('shows every queue on the connection by default', async () => {
    const handle = await main(['--port', '0', '--redis-prefix', PREFIX], {});
    expect(handle).not.toBeNull();
    handles.push(handle!);

    expect(handle!.url).toMatch(/^http:\/\/localhost:\d+$/);
    expect(await queueNames(handle!)).toEqual(['cli-emails', 'cli-reports']);
  });

  it('applies the --queues allow-list flag', async () => {
    const handle = await main(
      ['--port', '0', '--host', '127.0.0.1', '--redis-prefix', PREFIX, '--queues', 'cli-reports'],
      {}
    );
    expect(handle).not.toBeNull();
    handles.push(handle!);

    expect(await queueNames(handle!)).toEqual(['cli-reports']);
  });

  it('applies the BULLMQ_DASH_QUEUES env allow-list', async () => {
    const handle = await main(['--port', '0', '--host', '127.0.0.1', '--redis-prefix', PREFIX], {
      BULLMQ_DASH_QUEUES: 'cli-emails',
    });
    expect(handle).not.toBeNull();
    handles.push(handle!);

    expect(await queueNames(handle!)).toEqual(['cli-emails']);
  });

  it('applies a JSON config file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bullmq-dash-'));
    const configPath = join(dir, 'dash.json');
    writeFileSync(
      configPath,
      JSON.stringify({ redis: { prefix: PREFIX }, queues: ['cli-emails', 'cli-reports'] })
    );

    const handle = await main(['--config', configPath, '--port', '0', '--host', '127.0.0.1'], {});
    expect(handle).not.toBeNull();
    handles.push(handle!);

    expect(await queueNames(handle!)).toEqual(['cli-emails', 'cli-reports']);
  });

  it('flags win over env vars', async () => {
    const handle = await main(
      ['--port', '0', '--host', '127.0.0.1', '--redis-prefix', PREFIX, '--queues', 'cli-reports'],
      { BULLMQ_DASH_QUEUES: 'cli-emails' }
    );
    expect(handle).not.toBeNull();
    handles.push(handle!);

    expect(await queueNames(handle!)).toEqual(['cli-reports']);
  });

  it('prints usage for --help without booting', async () => {
    const printed: string[] = [];
    const log = console.log;
    console.log = (message?: unknown) => printed.push(String(message));

    const handle = await main(['--help'], {});
    console.log = log;

    expect(handle).toBeNull();
    expect(printed.join('\n')).toContain('Usage: bullmq-dash');
  });

  it('prints the version for --version without booting', async () => {
    const printed: string[] = [];
    const log = console.log;
    console.log = (message?: unknown) => printed.push(String(message));

    const handle = await main(['--version'], {});
    console.log = log;

    expect(handle).toBeNull();
    expect(printed.join('\n')).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('rejects an unknown flag', async () => {
    await expect(main(['--nope'], {})).rejects.toThrow();
  });
});

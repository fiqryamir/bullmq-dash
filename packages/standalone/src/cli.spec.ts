import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { main, type CliHandle } from './cli';

const PREFIX = `cli-${process.pid}-${Date.now()}`;
const redisOptions = () => ({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
});

const handles: CliHandle[] = [];
let client: Redis;

beforeAll(async () => {
  client = new Redis(redisOptions());
  await client.ping();

  const emails = new Queue('cli-emails', { connection: redisOptions(), prefix: PREFIX });
  const reports = new Queue('cli-reports', { connection: redisOptions(), prefix: PREFIX });
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

async function queueNames(handle: CliHandle): Promise<string[]> {
  const response = await request(handle.url).get('/api/queues').expect(200);
  return (response.body.queues as { name: string }[]).map((queue) => queue.name);
}

describe('the bullmq-dash CLI', () => {
  it('boots with zero config (defaults: localhost, all queues)', async () => {
    const handle = await main(['--port', '0', '--redis-prefix', PREFIX], {});
    handles.push(handle);

    expect(handle.url).toMatch(/^http:\/\/localhost:\d+$/);
    expect(await queueNames(handle)).toEqual(['cli-emails', 'cli-reports']);
  });

  it('applies the --queues allow-list flag', async () => {
    const handle = await main(
      ['--port', '0', '--host', '127.0.0.1', '--redis-prefix', PREFIX, '--queues', 'cli-reports'],
      {}
    );
    handles.push(handle);

    expect(await queueNames(handle)).toEqual(['cli-reports']);
  });

  it('applies the BULLMQ_DASH_QUEUES env allow-list', async () => {
    const handle = await main(['--port', '0', '--host', '127.0.0.1', '--redis-prefix', PREFIX], {
      BULLMQ_DASH_QUEUES: 'cli-emails',
    });
    handles.push(handle);

    expect(await queueNames(handle)).toEqual(['cli-emails']);
  });

  it('applies a JSON config file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bullmq-dash-'));
    const configPath = join(dir, 'dash.json');
    writeFileSync(
      configPath,
      JSON.stringify({ redis: { prefix: PREFIX }, queues: ['cli-emails', 'cli-reports'] })
    );

    const handle = await main(['--config', configPath, '--port', '0', '--host', '127.0.0.1'], {});
    handles.push(handle);

    expect(await queueNames(handle)).toEqual(['cli-emails', 'cli-reports']);
  });

  it('flags win over env vars', async () => {
    const handle = await main(
      ['--port', '0', '--host', '127.0.0.1', '--redis-prefix', PREFIX, '--queues', 'cli-reports'],
      { BULLMQ_DASH_QUEUES: 'cli-emails' }
    );
    handles.push(handle);

    expect(await queueNames(handle)).toEqual(['cli-reports']);
  });

  it('prints usage for --help without booting', async () => {
    const printed: string[] = [];
    const log = console.log;
    console.log = (message?: unknown) => printed.push(String(message));

    const handle = await main(['--help'], {});
    console.log = log;

    expect(handle.url).toBe('');
    expect(printed.join('\n')).toContain('Usage: bullmq-dash');
    await handle.close();
  });

  it('prints the version for --version without booting', async () => {
    const printed: string[] = [];
    const log = console.log;
    console.log = (message?: unknown) => printed.push(String(message));

    const handle = await main(['--version'], {});
    console.log = log;

    expect(handle.url).toBe('');
    expect(printed.join('\n')).toMatch(/^\d+\.\d+\.\d+/);
    await handle.close();
  });

  it('rejects an unknown flag', async () => {
    await expect(main(['--nope'], {})).rejects.toThrow();
  });
});


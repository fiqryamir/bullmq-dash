import { spawn, type ChildProcess } from 'node:child_process';
import Redis from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearKeys, connectRedis, seedQueues, uniquePrefix } from './testUtils/redis';
import { waitForUrl } from './testUtils/waitForUrl';

const PREFIX = uniquePrefix('bin');
const BIN_PATH = new URL('../dist/bin.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

let client: Redis;
let child: ChildProcess | undefined;

function spawnBin(extraArgs: string[] = []): ChildProcess {
  const spawned = spawn(process.execPath, [BIN_PATH, '--port', '0', ...extraArgs], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, REDIS_PREFIX: undefined },
  });
  child = spawned;
  return spawned;
}

beforeAll(async () => {
  client = await connectRedis();
  await seedQueues(PREFIX, [
    { name: 'bin-emails', jobs: [{ name: 'welcome', data: { to: 'a@example.com' } }] },
  ]);
});

afterAll(async () => {
  child?.kill('SIGTERM');
  await clearKeys(client, PREFIX);
  await client.quit();
});

describe('the bullmq-dash bin', () => {
  it('boots the dashboard from the built bin and answers the REST contract', async () => {
    const bin = spawnBin(['--redis-prefix', PREFIX]);
    const url = await waitForUrl(bin);

    const response = await request(url).get('/api/queues').expect(200);
    const names = (response.body.queues as { name: string }[]).map((queue) => queue.name);
    expect(names).toEqual(['bin-emails']);

    await request(url).get('/').expect(200);
    bin.kill('SIGTERM');
  });

  it('applies the --queues allow-list from the bin', async () => {
    const bin = spawnBin(['--redis-prefix', PREFIX, '--queues', 'bin-emails']);
    const url = await waitForUrl(bin);

    const response = await request(url).get('/api/queues').expect(200);
    const names = (response.body.queues as { name: string }[]).map((queue) => queue.name);
    expect(names).toEqual(['bin-emails']);

    bin.kill('SIGTERM');
  });

  it('exits with a clear error when Redis is unreachable', async () => {
    const bin = spawnBin(['--redis-host', '127.0.0.1', '--redis-port', '1']);
    const exitCode = await new Promise<number | null>((resolve) => {
      bin.once('exit', (code) => resolve(code));
    });

    expect(exitCode).not.toBe(0);
  });
});

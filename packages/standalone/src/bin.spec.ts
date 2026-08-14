import { spawn, type ChildProcess } from 'node:child_process';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PREFIX = `bin-${process.pid}-${Date.now()}`;
const BIN_PATH = new URL('../dist/bin.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const redisOptions = () => ({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
});

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

async function waitForUrl(candidate: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(
      () => reject(new Error(`bin did not report a listening url. Output:\n${buffer}`)),
      15_000
    );
    candidate.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const match = buffer.match(/listening on (http:\/\/\S+)/);
      if (match?.[1]) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    candidate.stderr?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
    });
    candidate.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`bin exited with code ${code} before listening. Output:\n${buffer}`));
    });
  });
}

beforeAll(async () => {
  client = new Redis(redisOptions());
  await client.ping();

  const queue = new Queue('bin-emails', { connection: redisOptions(), prefix: PREFIX });
  await queue.add('welcome', { to: 'a@example.com' });
  await queue.close();
});

afterAll(async () => {
  child?.kill('SIGTERM');
  const keys = await client.keys(`${PREFIX}:*`);
  if (keys.length > 0) {
    await client.del(...keys);
  }
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

import Redis from 'ioredis';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { discoverQueueNames } from './discoverQueues';

const PREFIX = `disc-${process.pid}-${Date.now()}`;
let client: Redis;

beforeAll(async () => {
  client = new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
  });
  await client.ping();
});

afterEach(async () => {
  const keys = await client.keys(`${PREFIX}:*`);
  const unrelated = await client.keys('unrelated:*');
  const all = [...keys, ...unrelated];
  if (all.length > 0) {
    await client.del(...all);
  }
});

afterAll(async () => {
  await client.quit();
});

describe('discoverQueueNames', () => {
  it('discovers queue names from the `<prefix>:*:meta` keys', async () => {
    await client.set(`${PREFIX}:alpha:meta`, '{}');
    await client.set(`${PREFIX}:beta:meta`, '{}');

    expect(await discoverQueueNames(client, PREFIX)).toEqual(['alpha', 'beta']);
  });

  it('ignores non-meta keys and keys under other prefixes', async () => {
    await client.set(`${PREFIX}:alpha:meta`, '{}');
    await client.set(`${PREFIX}:alpha:wait`, 'x');
    await client.set(`${PREFIX}:alpha:events`, 'x');
    await client.set(`unrelated:gamma:meta`, '{}');

    expect(await discoverQueueNames(client, PREFIX)).toEqual(['alpha']);
  });

  it('returns an empty list when nothing matches', async () => {
    expect(await discoverQueueNames(client, `absent-${PREFIX}`)).toEqual([]);
  });

  it('keeps queue names that contain colons', async () => {
    await client.set(`${PREFIX}:tenant:orders:meta`, '{}');

    expect(await discoverQueueNames(client, PREFIX)).toContain('tenant:orders');
  });

  it('sorts the discovered names', async () => {
    await client.set(`${PREFIX}:zeta:meta`, '{}');
    await client.set(`${PREFIX}:alpha:meta`, '{}');

    const names = await discoverQueueNames(client, PREFIX);
    expect(names).toEqual([...names].sort());
  });

  it('filters the discovered queues to the allow-list', async () => {
    await client.set(`${PREFIX}:alpha:meta`, '{}');
    await client.set(`${PREFIX}:beta:meta`, '{}');
    await client.set(`${PREFIX}:gamma:meta`, '{}');

    expect(await discoverQueueNames(client, PREFIX, ['beta', 'gamma', 'missing'])).toEqual([
      'beta',
      'gamma',
    ]);
  });
});

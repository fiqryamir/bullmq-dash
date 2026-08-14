import Redis from 'ioredis';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { discoverQueueNames } from './discoverQueues';
import { clearKeys, connectRedis, uniquePrefix } from './testUtils/redis';

const PREFIX = uniquePrefix('disc');
let client: Redis;

beforeAll(async () => {
  client = await connectRedis();
});

afterEach(async () => {
  await clearKeys(client, PREFIX, 'unrelated');
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
});

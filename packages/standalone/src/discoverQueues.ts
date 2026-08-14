import type Redis from 'ioredis';

const META_SUFFIX = ':meta';

/**
 * Discovers the queue names a BullMQ prefix holds by scanning the
 * `<prefix>:*:meta` keys. BullMQ v6 has no queue-registry API, so the
 * meta keys are the ground truth for "every queue on this connection".
 * Results are sorted.
 */
export async function discoverQueueNames(client: Redis, prefix: string): Promise<string[]> {
  const pattern = `${prefix}:*:meta`;
  const names = new Set<string>();

  const stream = client.scanStream({ match: pattern, count: 100 });
  for await (const keys of stream) {
    for (const key of keys as string[]) {
      if (!key.startsWith(`${prefix}:`) || !key.endsWith(META_SUFFIX)) {
        continue;
      }
      const name = key.slice(prefix.length + 1, key.length - META_SUFFIX.length);
      if (name) {
        names.add(name);
      }
    }
  }

  return [...names].sort();
}

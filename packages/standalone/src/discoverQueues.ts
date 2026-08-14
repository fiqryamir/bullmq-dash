import type Redis from 'ioredis';

const META_SUFFIX = ':meta';

/**
 * Discovers the queue names a BullMQ prefix holds by scanning the
 * `<prefix>:*:meta` keys. BullMQ v6 has no queue-registry API, so the
 * meta keys are the ground truth for "every queue on this connection".
 * Results are sorted; an allow-list filters them (unknown names are
 * dropped — a queue that has no keys in Redis has nothing to show).
 */
export async function discoverQueueNames(
  client: Redis,
  prefix: string,
  allowList?: string[]
): Promise<string[]> {
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

  const discovered = [...names].sort();
  if (!allowList) {
    return discovered;
  }

  const allowed = new Set(allowList);
  return discovered.filter((name) => allowed.has(name));
}

import { Queue } from 'bullmq';
import Redis from 'ioredis';

export function redisOptions(): { host: string; port: number } {
  return {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
  };
}

/** A per-run prefix so parallel test runs never see each other's keys. */
export function uniquePrefix(label: string): string {
  return `${label}-${process.pid}-${Date.now()}`;
}

export async function connectRedis(): Promise<Redis> {
  const client = new Redis(redisOptions());
  await client.ping();
  return client;
}

/** Deletes every key under the given prefixes. */
export async function clearKeys(client: Redis, ...prefixes: string[]): Promise<void> {
  const keys = (await Promise.all(prefixes.map((prefix) => client.keys(`${prefix}:*`)))).flat();
  if (keys.length > 0) {
    await client.del(...keys);
  }
}

export type SeedQueueSpec = {
  name: string;
  jobs?: Array<{ name: string; data?: unknown }>;
};

/**
 * Creates the queues, seeds the jobs, and closes the queues again - the
 * keys stay behind, which is what the standalone discovers by prefix.
 */
export async function seedQueues(prefix: string, specs: SeedQueueSpec[]): Promise<string[]> {
  const queues = specs.map((spec) => new Queue(spec.name, { connection: redisOptions(), prefix }));
  try {
    for (let index = 0; index < specs.length; index++) {
      const spec = specs[index]!;
      if (spec.jobs) {
        await queues[index]!.addBulk(
          spec.jobs.map((job) => ({ name: job.name, data: job.data ?? {} }))
        );
      }
    }
  } finally {
    await Promise.all(queues.map((queue) => queue.close()));
  }
  return specs.map((spec) => spec.name);
}

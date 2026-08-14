import type { RedisClient } from 'bullmq';

/** Milliseconds in one minute — the metrics bucket granularity. */
export const METRICS_MINUTE_MS = 60_000;

/** Default keyspace prefix for the dashboard-owned metrics buckets. */
export const DEFAULT_METRICS_PREFIX = 'bullmq-dash:metrics';

/** Default bucket lifetime — 7 days. */
export const DEFAULT_METRICS_RETENTION_SECONDS = 7 * 24 * 60 * 60;

export const minuteIndex = (timestampMs: number): number => Math.floor(timestampMs / METRICS_MINUTE_MS);

/**
 * The per-minute counters and sums a bucket accumulates. Duration and wait
 * sums are stored in milliseconds alongside their sample counts so averages
 * stay exact however events are batched.
 */
export interface MetricsBucketDeltas {
  completed?: number;
  failed?: number;
  durationSum?: number;
  durationCount?: number;
  waitSum?: number;
  waitCount?: number;
}

export interface MetricsRawBucket {
  /** The minute index (`Math.floor(ts / 60000)`) the bucket covers. */
  minute: number;
  completed: number;
  failed: number;
  durationSum: number;
  durationCount: number;
  waitSum: number;
  waitCount: number;
}

const BUCKET_FIELDS = [
  'completed',
  'failed',
  'durationSum',
  'durationCount',
  'waitSum',
  'waitCount',
] as const;

/**
 * Increments several fields of a bucket hash and refreshes its TTL in one
 * atomic script run: `KEYS[1]` is the bucket key, `ARGV[1]` the TTL in
 * seconds, followed by field/value pairs.
 */
const INCR_BUCKET_SCRIPT = `
local key = KEYS[1]
local ttl = tonumber(ARGV[1])
for i = 2, #ARGV, 2 do
  redis.call('HINCRBY', key, ARGV[i], ARGV[i + 1])
end
if ttl and ttl > 0 then
  redis.call('EXPIRE', key, ttl)
end
return 1
`;

const INCR_BUCKET_COMMAND = 'bullmqDashMetricsIncr';

const asNumber = (value: string | null): number => (value === null ? 0 : Number(value) || 0);

/**
 * The dashboard-owned Redis metrics store: one auto-expiring hash per queue
 * per minute, holding event-derived aggregates (counts, duration and wait
 * sums) with a configurable retention. Reads and writes go through BullMQ's
 * `RedisClient` interface so the store works on whichever Redis client the
 * embedded host already runs.
 */
export class MetricsStore {
  private readonly prefix: string;
  private readonly retentionSeconds: number;
  private client: RedisClient | undefined;
  /**
   * Runs the incr script for one bucket key. BullMQ's adapted clients expose
   * `runCommand`; raw ioredis instances expose the script as a defined
   * command instead — both are normalized here so the store accepts either.
   */
  private runIncrScript: ((key: string, args: (string | number)[]) => Promise<unknown>) | undefined;

  /** The configured bucket lifetime, in seconds — the widest window reads can serve. */
  public get bucketRetentionSeconds(): number {
    return this.retentionSeconds;
  }

  constructor(
    client?: RedisClient,
    options: { prefix?: string; retentionSeconds?: number } = {}
  ) {
    this.prefix = options.prefix ?? DEFAULT_METRICS_PREFIX;
    this.retentionSeconds = options.retentionSeconds ?? DEFAULT_METRICS_RETENTION_SECONDS;
    if (client) {
      this.bind(client);
    }
  }

  /**
   * Binds the store to the Redis client of the first queue that gets
   * captured. The board has no connection of its own — it writes through
   * whichever Redis its queues live on — so binding is deferred until a
   * source exists.
   */
  public bind(client: RedisClient): void {
    if (this.client) {
      return;
    }
    this.client = client;

    // Register the incr script on the client first: BullMQ v6's adapted
    // clients look up Lua commands by name (`runCommand` → `client[name]`),
    // so the command must exist before it can run.
    client.defineCommand(INCR_BUCKET_COMMAND, { numberOfKeys: 1, lua: INCR_BUCKET_SCRIPT });

    const runCommand = (client as RedisClient & { runCommand?: unknown }).runCommand;
    if (typeof runCommand === 'function') {
      this.runIncrScript = (key, args) => client.runCommand(INCR_BUCKET_COMMAND, [key, ...args]);
    } else {
      const command = (client as unknown as Record<string, (...commandArgs: unknown[]) => Promise<unknown>>)[
        INCR_BUCKET_COMMAND
      ]!;
      this.runIncrScript = (key, args) => command.call(client as never, key, ...args);
    }
  }

  private bucketKey(queueName: string, minute: number): string {
    return `${this.prefix}:${queueName}:${minute}`;
  }

  /**
   * Adds the deltas to the queue's bucket for the minute and refreshes its
   * TTL. Zero deltas are skipped; a bucket with nothing to write is left
   * untouched.
   */
  public async incr(queueName: string, minute: number, deltas: MetricsBucketDeltas): Promise<void> {
    const args: (string | number)[] = [this.retentionSeconds];
    for (const field of BUCKET_FIELDS) {
      const delta = deltas[field];
      if (delta && delta > 0) {
        args.push(field, delta);
      }
    }
    if (args.length === 1 || !this.runIncrScript) {
      return;
    }

    await this.runIncrScript(this.bucketKey(queueName, minute), args);
  }

  public async getBucket(queueName: string, minute: number): Promise<MetricsRawBucket> {
    if (!this.client) {
      return {
        minute,
        completed: 0,
        failed: 0,
        durationSum: 0,
        durationCount: 0,
        waitSum: 0,
        waitCount: 0,
      };
    }
    const values = await this.client.hmget(this.bucketKey(queueName, minute), ...BUCKET_FIELDS);
    return {
      minute,
      completed: asNumber(values[0] ?? null),
      failed: asNumber(values[1] ?? null),
      durationSum: asNumber(values[2] ?? null),
      durationCount: asNumber(values[3] ?? null),
      waitSum: asNumber(values[4] ?? null),
      waitCount: asNumber(values[5] ?? null),
    };
  }

  /**
   * Reads every bucket that exists between `fromMinute` and `toMinute`
   * (inclusive) in one pipelined round trip, ordered oldest-first. Minutes
   * without a bucket are omitted.
   */
  public async getBuckets(
    queueName: string,
    fromMinute: number,
    toMinute: number
  ): Promise<MetricsRawBucket[]> {
    if (fromMinute > toMinute || !this.client) {
      return [];
    }

    const pipeline = this.client.pipeline() as ReturnType<RedisClient['pipeline']> & {
      hmget(key: string, ...fields: string[]): unknown;
    };
    for (let minute = fromMinute; minute <= toMinute; minute += 1) {
      pipeline.hmget(this.bucketKey(queueName, minute), ...BUCKET_FIELDS);
    }

    const results = (await pipeline.exec()) ?? [];
    const buckets: MetricsRawBucket[] = [];
    for (let offset = 0; offset < results.length; offset += 1) {
      const result = results[offset];
      if (!result) {
        continue;
      }
      const [error, values] = result;
      if (error) {
        throw error;
      }
      const raw = values as (string | null)[];
      const minute = fromMinute + offset;
      const bucket: MetricsRawBucket = {
        minute,
        completed: asNumber(raw[0] ?? null),
        failed: asNumber(raw[1] ?? null),
        durationSum: asNumber(raw[2] ?? null),
        durationCount: asNumber(raw[3] ?? null),
        waitSum: asNumber(raw[4] ?? null),
        waitCount: asNumber(raw[5] ?? null),
      };
      if (bucket.completed > 0 || bucket.failed > 0 || bucket.waitCount > 0 || bucket.durationCount > 0) {
        buckets.push(bucket);
      }
    }
    return buckets;
  }
}

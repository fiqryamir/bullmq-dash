import { QueueEvents, type RedisClient } from 'bullmq';
import { minuteIndex, type MetricsBucketDeltas, type MetricsStore } from './store';

/**
 * A queue the capture listens to: `queueName` is the raw BullMQ queue name
 * (the QueueEvents stream), `prefix` the queue's Redis key prefix when it
 * lives under one, while the store keeps the dashboard's registered name
 * (which may carry the adapter's own prefix option).
 */
export interface MetricsSource {
  queueName: string;
  client: RedisClient;
  prefix?: string;
}

/**
 * The millisecond timestamp of an event, from its Redis stream entry id
 * (which leads with `<ms>-<sequence>`).
 */
export const eventTimestampMs = (eventId: string): number => Number(eventId.split('-')[0]) || 0;

type JobTiming = {
  waitStart?: number;
  activeStart?: number;
};

/**
 * Derives per-minute aggregates from a queue's QueueEvents stream — waiting
 * → active gives wait time, active → completed/failed gives duration — and
 * writes them to the metrics store. Capture is always on for every watched
 * queue and requires no worker configuration. Timing only records while the
 * dashboard listens; the store read path covers downtime with BullMQ's
 * native counters.
 */
export class MetricsCapture {
  private readonly timings = new Map<string, JobTiming>();
  private readonly listeners = new Map<string, { events: QueueEvents; connection: RedisClient }>();

  constructor(private readonly store: MetricsStore) {}

  private timingKey(registeredName: string, jobId: string): string {
    return `${registeredName}:${jobId}`;
  }

  private noteWaitStart(registeredName: string, jobId: string, id: string): void {
    const key = this.timingKey(registeredName, jobId);
    const timing = this.timings.get(key) ?? {};
    timing.waitStart = eventTimestampMs(id);
    this.timings.set(key, timing);
  }

  private noteActive(registeredName: string, jobId: string, id: string): void {
    const ts = eventTimestampMs(id);
    const key = this.timingKey(registeredName, jobId);
    const timing = this.timings.get(key) ?? {};

    // `>=` on purpose: a job the worker picks up within the same millisecond
    // has a zero wait, which is a valid sample — not a missing one.
    if (timing.waitStart !== undefined && ts >= timing.waitStart) {
      this.write(registeredName, ts, { waitSum: ts - timing.waitStart, waitCount: 1 });
    }
    timing.activeStart = ts;
    this.timings.set(key, timing);
  }

  private noteFinished(registeredName: string, jobId: string, id: string, type: 'completed' | 'failed'): void {
    const ts = eventTimestampMs(id);
    const key = this.timingKey(registeredName, jobId);
    const timing = this.timings.get(key);

    const deltas: MetricsBucketDeltas = { [type]: 1 };
    // `>=` on purpose: a job that finishes in the same millisecond it started
    // has a zero duration, which is a valid sample — not a missing one.
    if (timing?.activeStart !== undefined && ts >= timing.activeStart) {
      deltas.durationSum = ts - timing.activeStart;
      deltas.durationCount = 1;
    }
    this.write(registeredName, ts, deltas);
    this.timings.delete(key);
  }

  /**
   * Writes through to the store, ignoring capture failures: a metrics write
   * must never take the dashboard down with it.
   */
  private write(registeredName: string, ts: number, deltas: MetricsBucketDeltas): void {
    void this.store.incr(registeredName, minuteIndex(ts), deltas).catch(() => {});
  }

  /**
   * Starts listening to the queue's event stream. The stream read is blocking,
   * so the listener runs on its own duplicated connection — never the host's
   * — configured the way BullMQ's blocking connections require.
   */
  public async addQueue(registeredName: string, source: MetricsSource): Promise<void> {
    if (this.listeners.has(registeredName)) {
      return;
    }

    // The board has no connection of its own: the first queue captured
    // provides the client the store writes through.
    this.store.bind(source.client);

    const connection = source.client.duplicate({ maxRetriesPerRequest: null } as never);
    const events = new QueueEvents(source.queueName, {
      connection,
      ...(source.prefix !== undefined ? { prefix: source.prefix } : {}),
    });
    // An unhandled 'error' event would crash the host process; capture must
    // degrade silently when Redis is unavailable.
    events.on('error', () => {});

    events.on('waiting', (args: { jobId: string }, id: string) => {
      this.noteWaitStart(registeredName, args.jobId, id);
    });
    events.on('added', (args: { jobId: string }, id: string) => {
      this.noteWaitStart(registeredName, args.jobId, id);
    });
    events.on('active', (args: { jobId: string }, id: string) => {
      this.noteActive(registeredName, args.jobId, id);
    });
    events.on('completed', (args: { jobId: string }, id: string) => {
      this.noteFinished(registeredName, args.jobId, id, 'completed');
    });
    events.on('failed', (args: { jobId: string }, id: string) => {
      this.noteFinished(registeredName, args.jobId, id, 'failed');
    });

    this.listeners.set(registeredName, { events, connection });
  }

  /** The registered names of the queues currently being captured. */
  public queueNames(): string[] {
    return [...this.listeners.keys()];
  }

  public async removeQueue(registeredName: string): Promise<void> {
    const listener = this.listeners.get(registeredName);
    if (!listener) {
      return;
    }
    this.listeners.delete(registeredName);
    await listener.events.close();
    await listener.connection.quit();
  }

  public async close(): Promise<void> {
    await Promise.all(
      [...this.listeners.values()].map(async (listener) => {
        await listener.events.close();
        await listener.connection.quit();
      })
    );
    this.listeners.clear();
  }
}


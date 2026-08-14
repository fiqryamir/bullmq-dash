import { FlowProducer, Queue, type Job, type JobType, type RedisClient } from 'bullmq';
import { STATUSES } from '../constants/statuses';
import type { MetricsSource } from '../metrics/capture';
import type { NativeMetrics } from '../metrics/native';
import type {
  JobCleanStatus,
  JobCounts,
  JobLogs,
  JobStatus,
  QueueAdapterOptions,
  QueueWorker,
  Status,
} from '../typings/app';
import { BaseAdapter } from './base';

/** The `:w:<name>` suffix BullMQ appends to the connection name of a named worker. */
const WORKER_NAME_SEPARATOR = ':w:';

/**
 * v5 exposes the Redis connection on `Queue#client`; v6 moved it behind
 * pluggable backends (Redis, Postgres, ...).
 */
type VersionedQueue = {
  client?: Promise<RedisClient>;
  getBackend?: () => { client?: Promise<RedisClient> } | undefined;
};

type FlowProducerWithBackend = new (
  opts: Queue['opts'],
  backendFactory: () => unknown
) => FlowProducer;

/**
 * One producer per connection, however many adapters share it: each producer
 * pins listeners on the client (or backend) and is never closed, so the entry
 * must die with the connection.
 */
const flowProducerCache = new WeakMap<object, FlowProducer>();

export class BullMQAdapter extends BaseAdapter {
  constructor(
    private queue: Queue,
    options: Partial<QueueAdapterOptions> = {}
  ) {
    super('bullmq', options);
    if (!(queue instanceof Queue || `${(queue as Queue).metaValues?.version}`?.startsWith('bullmq'))) {
      throw new Error(`You've used the BullMQ adapter with a non-BullMQ queue.`);
    }
  }

  /** BullMQ v6 dropped the paused job state; a paused queue's jobs are stored as waiting. */
  private get hasNativePausedState(): boolean {
    return !this.isBullMqV6;
  }

  /** v6 moved the connection behind pluggable backends; v5 exposes the client directly. */
  private get isBullMqV6(): boolean {
    return typeof (this.queue as unknown as { getBackend?: () => unknown }).getBackend === 'function';
  }

  public getName(): string {
    return `${this.prefix}${this.queue.name}`;
  }

  public async getJobCounts(): Promise<JobCounts> {
    return (await this.queue.getJobCounts()) as unknown as JobCounts;
  }

  public async getJobCountForStatus(status: JobStatus): Promise<number> {
    if (status === STATUSES.paused && this.isBullMqV6) {
      return (await this.queue.isPaused())
        ? ((await this.queue.getJobCountByTypes('waiting')) ?? 0)
        : 0;
    }

    return (await this.queue.getJobCountByTypes(status as JobType)) ?? 0;
  }

  public async getJobs(jobStatuses: JobStatus[], start?: number, end?: number): Promise<Job[]> {
    const statuses = await this.resolveJobStatuses(jobStatuses);
    if (statuses.length === 0) {
      return [];
    }

    const jobs = (await this.queue.getJobs(statuses, start, end)) as (Job | undefined)[];
    return jobs.filter((job): job is Job => !!job);
  }

  public async getJob(jobId: string): Promise<Job | null> {
    return (await this.queue.getJob(jobId)) ?? null;
  }

  public async getJobLogs(jobId: string, start: number, end: number): Promise<JobLogs> {
    return this.queue.getJobLogs(jobId, start, end, false);
  }

  private async resolveJobStatuses(jobStatuses: JobStatus[]): Promise<JobType[]> {
    if (this.hasNativePausedState || !jobStatuses.includes(STATUSES.paused)) {
      return jobStatuses as JobType[];
    }

    if (!(await this.queue.isPaused())) {
      return jobStatuses.filter((status) => status !== STATUSES.paused);
    }

    return [...new Set(jobStatuses.map((status) => (status === STATUSES.paused ? 'waiting' : status)))];
  }

  public isPaused(): Promise<boolean> {
    return this.queue.isPaused();
  }

  public pause(): Promise<void> {
    return this.queue.pause();
  }

  public resume(): Promise<void> {
    return this.queue.resume();
  }

  public empty(): Promise<void> {
    return this.queue.drain();
  }

  public async promoteAll(): Promise<void> {
    await this.queue.promoteJobs();
  }

  public async clean(jobStatus: JobCleanStatus, graceTimeMs: number): Promise<void> {
    await this.queue.clean(graceTimeMs, Number.MAX_SAFE_INTEGER, jobStatus);
  }

  public getGlobalConcurrency(): Promise<number | null> {
    return this.queue.getGlobalConcurrency?.() || null;
  }

  public getJobSchedulersCount(): Promise<number> {
    return this.queue.getJobSchedulersCount();
  }

  public async getWorkers(): Promise<QueueWorker[] | null> {
    const clients = await this.queue.getWorkers();
    return this.normalizeWorkers(clients, WORKER_NAME_SEPARATOR);
  }

  public async getFlowProducer(): Promise<FlowProducer | null> {
    const queue = this.queue as unknown as VersionedQueue;

    // v6: reuse the queue's backend, so the producer reads flow trees from
    // whatever datastore the queue lives in, Redis or not.
    if (typeof queue.getBackend === 'function') {
      const backend = queue.getBackend();
      if (!backend) {
        return null;
      }

      let producer = flowProducerCache.get(backend);
      if (!producer) {
        producer = new (FlowProducer as unknown as FlowProducerWithBackend)(
          this.queue.opts,
          () => backend
        );
        flowProducerCache.set(backend, producer);
      }
      return producer;
    }

    const client = await queue.client;
    if (!client) {
      return null;
    }

    let producer = flowProducerCache.get(client);
    if (!producer) {
      const prefix = this.queue.opts?.prefix;
      producer = new FlowProducer({ connection: client, ...(prefix ? { prefix } : {}) });
      flowProducerCache.set(client, producer);
    }
    return producer;
  }

  public async getMetrics(
    type: 'completed' | 'failed',
    start = 0,
    end = -1
  ): Promise<NativeMetrics> {
    return (await this.queue.getMetrics(type, start, end)) as NativeMetrics;
  }

  public async getMetricsSource(): Promise<MetricsSource | null> {
    const queue = this.queue as unknown as VersionedQueue;

    let clientPromise: Promise<RedisClient> | undefined;
    // v6 moved the connection behind pluggable backends; only Redis-backed
    // queues offer one that event capture can read.
    if (typeof queue.getBackend === 'function') {
      clientPromise = queue.getBackend()?.client;
    } else {
      clientPromise = queue.client;
    }

    if (!clientPromise) {
      return null;
    }
    try {
      return {
        queueName: this.queue.name,
        client: await clientPromise,
        ...(this.queue.opts?.prefix !== undefined ? { prefix: this.queue.opts.prefix } : {}),
      };
    } catch {
      return null;
    }
  }

  public getStatuses(): Status[] {
    return [STATUSES.latest, ...this.getJobStatuses()];
  }

  public getJobStatuses(): JobStatus[] {
    return [
      STATUSES.active,
      STATUSES.waiting,
      STATUSES.waitingChildren,
      STATUSES.prioritized,
      STATUSES.completed,
      STATUSES.failed,
      STATUSES.delayed,
      STATUSES.paused,
    ];
  }
}

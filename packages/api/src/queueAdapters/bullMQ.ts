import { FlowProducer, Queue, type Job, type JobSchedulerJson, type JobType, type RedisClient } from 'bullmq';
import { STATUSES } from '../constants/statuses';
import type { MetricsSource } from '../metrics/capture';
import type { NativeMetrics } from '../metrics/native';
import type {
  AppJobScheduler,
  JobCleanStatus,
  JobCounts,
  JobLogs,
  JobSchedulerAddResult,
  JobSchedulerRepeatOptions,
  JobSchedulerTemplate,
  JobSchedulerUpdateResult,
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

  public async getRedisInfo(): Promise<string | null> {
    const client = await this.resolveRedisClient();
    return client ? client.info() : null;
  }

  private async resolveRedisClient(): Promise<RedisClient | null> {
    const queue = this.queue as unknown as VersionedQueue;

    if (typeof queue.getBackend === 'function') {
      return (await queue.getBackend()?.client) ?? null;
    }

    return (await queue.client) ?? null;
  }

  public async getJobSchedulers(): Promise<Omit<AppJobScheduler, 'queueName'>[]> {
    const schedulers = await this.queue.getJobSchedulers(0, -1);

    return Promise.all(
      schedulers.map(async (scheduler) => ({
        id: scheduler.key,
        name: scheduler.name,
        ...(scheduler.pattern !== undefined ? { pattern: scheduler.pattern } : {}),
        ...(scheduler.every !== undefined ? { every: scheduler.every } : {}),
        ...(scheduler.tz !== undefined ? { tz: scheduler.tz } : {}),
        ...(scheduler.limit !== undefined ? { limit: scheduler.limit } : {}),
        ...(scheduler.startDate !== undefined ? { startDate: scheduler.startDate } : {}),
        ...(scheduler.endDate !== undefined ? { endDate: scheduler.endDate } : {}),
        ...(scheduler.next !== undefined ? { next: scheduler.next } : {}),
        ...(scheduler.iterationCount !== undefined
          ? { iterationCount: scheduler.iterationCount }
          : {}),
        ...(scheduler.template !== undefined
          ? { template: scheduler.template as Record<string, unknown> }
          : {}),
        ...(await this.getSchedulerRuns(scheduler)),
      }))
    );
  }

  public removeJobScheduler(id: string): Promise<boolean> {
    return this.queue.removeJobScheduler(id);
  }

  public override get supportsJobSchedulerUpdate(): boolean {
    return true;
  }

  public async updateJobScheduler(
    id: string,
    repeat: JobSchedulerRepeatOptions
  ): Promise<JobSchedulerUpdateResult> {
    const current = await this.queue.getJobScheduler(id);

    if (!current) {
      return 'not-found';
    }

    // The template is re-sent as it is stored: an upsert that omits it would
    // drop the job name, data and options the application registered.
    const template = {
      name: current.name,
      ...(current.template?.data !== undefined ? { data: current.template.data } : {}),
      ...(current.template?.opts !== undefined ? { opts: current.template.opts } : {}),
    };

    let next: Job | undefined;
    try {
      next = await this.queue.upsertJobScheduler(id, repeat, template);
    } catch (error) {
      // BullMQ works out the next fire time before it writes anything, so a
      // cron it cannot parse throws with the stored scheduler untouched.
      // Anything thrown for an interval schedule happened while writing.
      if (!repeat.pattern) {
        throw error;
      }
      return 'invalid-schedule';
    }

    // A schedule that can never fire again — an end date in the past, for
    // instance — is answered with nothing at all rather than an error.
    return next ? 'updated' : 'invalid-schedule';
  }

  public async addJobScheduler(
    id: string,
    repeat: JobSchedulerRepeatOptions,
    jobTemplate?: JobSchedulerTemplate
  ): Promise<JobSchedulerAddResult> {
    try {
      const next = await this.queue.upsertJobScheduler(id, repeat, jobTemplate);
      return next ? 'created' : 'invalid-schedule';
    } catch (error) {
      // Cron parse failures throw before anything is written; anything thrown
      // for an interval schedule is a real write failure.
      if (!repeat.pattern) {
        throw error;
      }
      return 'invalid-schedule';
    }
  }

  /**
   * What the dashboard can say about a scheduler's runs, worked out from the
   * ids BullMQ derives, `repeat:<schedulerId>:<scheduled millis>`.
   *
   * The next run is the delayed job waiting at `scheduler.next`. BullMQ
   * stores no last-run time, but it creates that delayed job the moment the
   * previous run moves to active, so the job's `timestamp` is when the
   * previous run started. An `iterationCount` of 1 means the job came from
   * the application's own upsert rather than from a run, and a scheduler past
   * its limit or end date has no pending job left at all.
   */
  private async getSchedulerRuns(
    scheduler: JobSchedulerJson
  ): Promise<Pick<AppJobScheduler, 'nextRunJobId' | 'lastRun' | 'lastRunJobId'>> {
    if (!scheduler.next) {
      return {};
    }

    const pendingRun = await this.queue.getJob(this.schedulerRunId(scheduler.key, scheduler.next));

    if (!pendingRun || !pendingRun.id) {
      return {};
    }

    const hasRun = !!scheduler.iterationCount && scheduler.iterationCount > 1;

    if (!hasRun || !pendingRun.timestamp) {
      return { nextRunJobId: pendingRun.id };
    }

    const lastRunJobId = await this.findLastRunId(scheduler);

    return {
      nextRunJobId: pendingRun.id,
      lastRun: pendingRun.timestamp,
      ...(lastRunJobId !== undefined ? { lastRunJobId } : {}),
    };
  }

  /**
   * The previous run's id, but only when it can be named and the job is still
   * there. Interval schedules fire exactly `every` milliseconds apart, so the
   * previous id follows from the next one; a cron pattern would have to be
   * parsed to say the same, which is not worth a dependency for a job that
   * `removeOnComplete` has usually deleted anyway.
   */
  private async findLastRunId(scheduler: JobSchedulerJson): Promise<string | undefined> {
    if (!scheduler.every || !scheduler.next) {
      return undefined;
    }

    const previousRun = await this.queue.getJob(
      this.schedulerRunId(scheduler.key, scheduler.next - scheduler.every)
    );

    return previousRun?.id;
  }

  private schedulerRunId(schedulerId: string, millis: number): string {
    return `repeat:${schedulerId}:${millis}`;
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

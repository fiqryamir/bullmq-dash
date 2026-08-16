import type { FlowProducer } from 'bullmq';
import type { MetricsSource } from '../metrics/capture';
import type { NativeMetrics } from '../metrics/native';
import type {
  AppJobScheduler,
  BullBoardRequest,
  FormatterField,
  JobCleanStatus,
  JobCounts,
  JobLogs,
  JobSchedulerAddResult,
  JobSchedulerRepeatOptions,
  JobSchedulerTemplate,
  JobSchedulerUpdateResult,
  JobStatus,
  QueueAdapterOptions,
  QueueJob,
  QueueType,
  QueueWorker,
  Status,
} from '../typings/app';

type RawClient = Record<string, string>;

export abstract class BaseAdapter {
  public readonly readOnlyMode: boolean;
  public readonly allowRetries: boolean;
  public readonly allowCompletedRetries: boolean;
  public readonly prefix: string;
  public readonly delimiter: string;
  public readonly description: string;
  public readonly displayName: string;
  public readonly type: QueueType;
  private formatters = new Map<FormatterField, (data: unknown) => unknown>();
  private _visibilityGuard: (request: BullBoardRequest) => Promise<boolean> | boolean = () => true;

  protected constructor(type: QueueType, options: Partial<QueueAdapterOptions> = {}) {
    this.readOnlyMode = options.readOnlyMode === true;
    this.allowRetries = this.readOnlyMode ? false : options.allowRetries !== false;
    this.allowCompletedRetries = this.allowRetries && options.allowCompletedRetries !== false;
    this.prefix = options.prefix || '';
    this.delimiter = options.delimiter || '';
    this.description = options.description || '';
    this.displayName = options.displayName || '';
    this.type = type;
  }

  public getDescription(): string {
    return this.description;
  }

  public getDisplayName(): string {
    return this.displayName;
  }

  public setFormatter<T extends FormatterField>(
    field: T,
    formatter: (data: unknown) => T extends 'name' ? string : unknown
  ): void {
    this.formatters.set(field, formatter);
  }

  public format(field: FormatterField, data: unknown, defaultValue = data): unknown {
    const fieldFormatter = this.formatters.get(field);
    return typeof fieldFormatter === 'function' ? fieldFormatter(data) : defaultValue;
  }

  public setVisibilityGuard(guard: (request: BullBoardRequest) => Promise<boolean> | boolean) {
    this._visibilityGuard = guard;
  }

  public isVisible(request: BullBoardRequest) {
    return this._visibilityGuard(request);
  }

  public abstract getName(): string;

  public abstract getJobCounts(): Promise<JobCounts>;

  /**
   * The number of jobs in a single state. Adapters whose backing library
   * stores a state differently than the dashboard presents it override this.
   */
  public async getJobCountForStatus(status: JobStatus): Promise<number> {
    const counts = await this.getJobCounts();
    return counts[status] ?? 0;
  }

  public abstract getJobs(jobStatuses: JobStatus[], start?: number, end?: number): Promise<QueueJob[]>;

  public abstract getJob(jobId: string): Promise<QueueJob | null>;

  /**
   * A page of the job's log rows plus the total row count. `start` and `end`
   * are inclusive 0-based indices into the logs ordered newest-first.
   */
  public abstract getJobLogs(jobId: string, start: number, end: number): Promise<JobLogs>;

  public abstract isPaused(): Promise<boolean>;

  public abstract getGlobalConcurrency(): Promise<number | null>;

  public abstract getJobSchedulersCount(): Promise<number>;

  /**
   * Schedulers of this queue, without their runs. Returned as a plain list
   * because there are rarely enough of them to page through.
   */
  public abstract getJobSchedulers(): Promise<Omit<AppJobScheduler, 'queueName'>[]>;

  /** Removes a scheduler; answers whether one with that id existed. */
  public abstract removeJobScheduler(id: string): Promise<boolean>;

  /**
   * Rewrites the schedule of an existing scheduler, leaving the job it
   * produces untouched. Adapters that cannot do this leave
   * {@link supportsJobSchedulerUpdate} false and are never asked.
   */
  public abstract updateJobScheduler(
    id: string,
    repeat: JobSchedulerRepeatOptions
  ): Promise<JobSchedulerUpdateResult>;

  /** Whether {@link updateJobScheduler} does anything. */
  public get supportsJobSchedulerUpdate(): boolean {
    return false;
  }

  /**
   * Registers a new scheduler (repeatable job) with an explicit template.
   * Adapters whose backing library has no scheduler concept answer
   * `not-supported` so the handler can reject with a 405.
   */
  public async addJobScheduler(
    _id: string,
    _repeat: JobSchedulerRepeatOptions,
    _jobTemplate?: JobSchedulerTemplate
  ): Promise<JobSchedulerAddResult> {
    return 'not-supported';
  }

  /**
   * Raw Redis `INFO` output, or null when the queue is not backed by Redis.
   */
  public abstract getRedisInfo(): Promise<string | null>;

  public abstract getStatuses(): Status[];

  public abstract getJobStatuses(): JobStatus[];

  /** Pauses the queue; a paused queue keeps waiting jobs but stops workers consuming them. */
  public abstract pause(): Promise<void>;

  public abstract resume(): Promise<void>;

  /** Removes every waiting and delayed job. */
  public abstract empty(): Promise<void>;

  /** Moves every delayed job to waiting. */
  public abstract promoteAll(): Promise<void>;

  /**
   * Removes the jobs in a state older than `graceTimeMs`. The meaning of
   * "older" is the backing library's — for BullMQ it is the job timestamp.
   */
  public abstract clean(jobStatus: JobCleanStatus, graceTimeMs: number): Promise<void>;

  /**
   * BullMQ's native per-minute counters for one finish type, empty for
   * backing libraries without them. Workers only record these when
   * configured with `metrics`, which the merge in the metrics endpoint turns
   * into a downtime fallback for the event-derived counts.
   */
  public async getMetrics(
    _type: 'completed' | 'failed',
    _start = 0,
    _end = -1
  ): Promise<NativeMetrics> {
    return { meta: { count: 0, prevTS: 0, prevCount: 0 }, data: [], count: 0 };
  }

  /**
   * The Redis connection and raw queue name the dashboard's metrics capture
   * listens on, or `null` when the backing library cannot provide one.
   */
  public async getMetricsSource(): Promise<MetricsSource | null> {
    return null;
  }

  /**
   * Connected workers for this queue, or `null` when the queue cannot answer.
   */
  public async getWorkers(): Promise<QueueWorker[] | null> {
    return null;
  }

  /**
   * A flow producer bound to the queue's datastore connection, or `null` when
   * the backing library has no flow support. BullMQ adapters return a cached
   * producer so flow trees are read from the same datastore the queue lives
   * in; Bull adapters answer `null` and flow views stay empty.
   */
  public async getFlowProducer(): Promise<FlowProducer | null> {
    return null;
  }

  /**
   * Turns raw `CLIENT LIST` entries into the shape the board renders.
   */
  protected normalizeWorkers(
    clients: RawClient[] | undefined | null,
    nameSeparator?: string
  ): QueueWorker[] | null {
    if (!Array.isArray(clients)) {
      return null;
    }

    const connections = clients.filter((client) => !!client.addr);
    if (clients.length > 0 && connections.length === 0) {
      return null;
    }

    return connections.map((client) => {
      const connectionName = client.rawname || client.name || '';
      const separatorAt = nameSeparator ? connectionName.indexOf(nameSeparator) : -1;

      return {
        id: client.id ?? '',
        name: separatorAt === -1 ? null : connectionName.slice(separatorAt + nameSeparator!.length),
        addr: client.addr ?? '',
        age: +(client.age ?? 0) || 0,
      };
    });
  }
}

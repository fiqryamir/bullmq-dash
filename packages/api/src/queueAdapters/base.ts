import type {
  BullBoardRequest,
  FormatterField,
  JobCounts,
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
  public abstract getJobLogs(
    jobId: string,
    start: number,
    end: number
  ): Promise<{ logs: string[]; count: number }>;

  public abstract isPaused(): Promise<boolean>;

  public abstract getGlobalConcurrency(): Promise<number | null>;

  public abstract getJobSchedulersCount(): Promise<number>;

  public abstract getStatuses(): Status[];

  public abstract getJobStatuses(): JobStatus[];

  /**
   * Connected workers for this queue, or `null` when the queue cannot answer.
   */
  public async getWorkers(): Promise<QueueWorker[] | null> {
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

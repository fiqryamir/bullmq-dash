import { Queue, type Job, type JobType } from 'bullmq';
import { STATUSES } from '../constants/statuses';
import type { JobCounts, JobStatus, QueueAdapterOptions, QueueWorker, Status } from '../typings/app';
import { BaseAdapter } from './base';

/** The `:w:<name>` suffix BullMQ appends to the connection name of a named worker. */
const WORKER_NAME_SEPARATOR = ':w:';

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
  private get hasPausedState(): boolean {
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

  private async resolveJobStatuses(jobStatuses: JobStatus[]): Promise<JobType[]> {
    if (this.hasPausedState || !jobStatuses.includes(STATUSES.paused)) {
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

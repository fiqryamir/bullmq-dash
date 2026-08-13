import type { JobStatus } from '../typings/app';

export const STATUSES = {
  latest: 'latest',
  active: 'active',
  waiting: 'waiting',
  waitingChildren: 'waiting-children',
  prioritized: 'prioritized',
  completed: 'completed',
  failed: 'failed',
  delayed: 'delayed',
  paused: 'paused',
} as const;

export type STATUSES = (typeof STATUSES)[keyof typeof STATUSES];

/**
 * The statuses `retry` accepts — only failed and completed jobs can be retried.
 */
export const RETRIABLE_STATUSES = [STATUSES.failed, STATUSES.completed] as const;

export type RetriableStatus = (typeof RETRIABLE_STATUSES)[number];

export function isRetriableStatus(status: string): status is RetriableStatus {
  return (RETRIABLE_STATUSES as readonly string[]).includes(status);
}

/**
 * The statuses BullMQ's `queue.clean` accepts, mapped onto the dashboard's
 * status names. `paused` is a presentation-only state here (v6 stores paused
 * jobs as waiting) and `waiting-children` is not a clean type.
 */
export const CLEANABLE_STATUSES = [
  STATUSES.completed,
  STATUSES.failed,
  STATUSES.delayed,
  STATUSES.waiting,
  STATUSES.active,
  STATUSES.prioritized,
] as const;

export type CleanableStatus = (typeof CLEANABLE_STATUSES)[number];

export function isCleanableStatus(status: string): status is CleanableStatus {
  return (CLEANABLE_STATUSES as readonly string[]).includes(status);
}

const JOB_STATUSES = Object.values(STATUSES).filter((status) => status !== STATUSES.latest);

export function isJobStatus(status: string): status is JobStatus {
  return (JOB_STATUSES as readonly string[]).includes(status);
}

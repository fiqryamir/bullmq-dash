import type { JobStatus } from '../api/contract';

/**
 * Maps each job state to its translation key (bull-board's `QUEUE.STATUS.*`
 * group). The chips and tabs render `t(STATUS_KEY[state])` instead of the raw
 * state string so a dashboard in another language shows the state names of
 * that language.
 */
export const STATUS_KEY: Record<JobStatus | 'unknown', string> = {
  waiting: 'QUEUE.STATUS.WAITING',
  active: 'QUEUE.STATUS.ACTIVE',
  completed: 'QUEUE.STATUS.COMPLETED',
  failed: 'QUEUE.STATUS.FAILED',
  delayed: 'QUEUE.STATUS.DELAYED',
  paused: 'QUEUE.STATUS.PAUSED',
  'waiting-children': 'QUEUE.STATUS.WAITING-CHILDREN',
  prioritized: 'QUEUE.STATUS.PRIORITIZED',
  unknown: 'QUEUE.STATUS.UNKNOWN',
};

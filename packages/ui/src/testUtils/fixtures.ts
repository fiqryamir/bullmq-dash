import type { AppJob, AppQueue, JobStatus } from '../api/contract';

export const COUNTS: AppQueue['counts'] = {
  latest: 0,
  active: 1,
  waiting: 5,
  'waiting-children': 0,
  prioritized: 0,
  completed: 12,
  failed: 3,
  delayed: 2,
  paused: 0,
};

export function makeQueue(overrides: Partial<AppQueue> = {}): AppQueue {
  return {
    name: 'emails',
    counts: { ...COUNTS },
    isPaused: false,
    readOnlyMode: false,
    ...overrides,
  };
}

export function makeJob(
  index: number,
  overrides: Partial<AppJob> = {},
  state: JobStatus = 'waiting'
): AppJob {
  return {
    id: `job-${index}`,
    name: 'mail-job',
    state,
    progress: index * 10,
    attempts: 1,
    timestamp: 1700000000000 + index,
    stacktrace: [],
    opts: { attempts: 1 },
    data: { index },
    ...overrides,
  };
}

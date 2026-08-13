import { useCallback } from 'react';
import { fetchQueueJobs, type JobStatus } from '../api/contract';
import { usePolledRequest } from '../api/usePolledRequest';

export type QueueJobsStatus = 'loading' | 'ready' | 'error';

export function useQueueJobs(
  queueName: string,
  status: JobStatus,
  page: number,
  jobsPerPage: number,
  pollingInterval?: number
) {
  const loader = useCallback(
    () => fetchQueueJobs(queueName, status, page, jobsPerPage),
    [queueName, status, page, jobsPerPage]
  );
  const { data, status: requestStatus } = usePolledRequest(loader, pollingInterval, true);

  return {
    jobs: data?.jobs ?? [],
    pagination: requestStatus === 'error' ? undefined : data?.pagination,
    status: requestStatus,
  };
}

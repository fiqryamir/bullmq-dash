import { useCallback } from 'react';
import { fetchJob } from '../api/contract';
import { usePolledRequest } from '../api/usePolledRequest';

export type JobDetailStatus = 'loading' | 'ready' | 'error';

export function useJobDetail(queueName: string, jobId: string, pollingInterval?: number) {
  const loader = useCallback(() => fetchJob(queueName, jobId), [queueName, jobId]);
  const { data, status } = usePolledRequest(loader, pollingInterval);

  return {
    detail: data,
    status,
  };
}

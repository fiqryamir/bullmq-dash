import { useCallback } from 'react';
import { fetchJobLogs } from '../api/contract';
import { usePolledRequest } from '../api/usePolledRequest';

export type JobLogsStatus = 'loading' | 'ready' | 'error';

export function useJobLogs(
  queueName: string,
  jobId: string,
  page: number,
  logsPerPage: number,
  pollingInterval?: number
) {
  const loader = useCallback(
    () => fetchJobLogs(queueName, jobId, page, logsPerPage),
    [queueName, jobId, page, logsPerPage]
  );
  const { data, status } = usePolledRequest(loader, pollingInterval, true);

  return {
    logs: data?.logs ?? [],
    count: data?.count ?? 0,
    pagination: status === 'error' ? undefined : data?.pagination,
    status,
  };
}

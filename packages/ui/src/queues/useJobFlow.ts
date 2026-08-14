import { useCallback } from 'react';
import { fetchJobFlow } from '../api/contract';
import { usePolledRequest } from '../api/usePolledRequest';

export function useJobFlow(queueName: string, jobId: string, pollingInterval?: number) {
  const loader = useCallback(() => fetchJobFlow(queueName, jobId), [queueName, jobId]);
  const { data, status } = usePolledRequest(loader, pollingInterval, true);

  return { flow: data, status };
}

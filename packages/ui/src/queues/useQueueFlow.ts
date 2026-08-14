import { useCallback } from 'react';
import { fetchQueueFlow } from '../api/contract';
import { usePolledRequest } from '../api/usePolledRequest';

export function useQueueFlow(queueName: string, pollingInterval?: number) {
  const loader = useCallback(() => fetchQueueFlow(queueName), [queueName]);
  const { data, status } = usePolledRequest(loader, pollingInterval, true);

  return {
    roots: data?.roots ?? [],
    nodeCount: data?.nodeCount ?? 0,
    truncated: data?.truncated ?? false,
    status,
  };
}

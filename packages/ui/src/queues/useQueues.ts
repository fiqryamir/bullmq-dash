import { useCallback } from 'react';
import { fetchQueues } from '../api/contract';
import { usePolledRequest } from '../api/usePolledRequest';

export type QueuesStatus = 'loading' | 'ready' | 'error';

export function useQueues(pollingInterval?: number) {
  const loader = useCallback(() => fetchQueues(), []);
  const { data, status } = usePolledRequest(loader, pollingInterval);

  return { queues: data?.queues ?? [], status };
}

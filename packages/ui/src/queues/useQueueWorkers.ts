import { useCallback, useState } from 'react';
import { fetchQueueWorkers } from '../api/contract';
import { usePolledRequest } from '../api/usePolledRequest';

/**
 * A queue's connected workers. Asked for once when the view opens (the queue
 * listing already reports `hasWorkers` on its polling interval), with a
 * manual refresh for when the answer should be re-asked.
 */
export function useQueueWorkers(queueName: string) {
  const [revision, setRevision] = useState(0);

  const loader = useCallback(() => fetchQueueWorkers(queueName), [queueName, revision]);

  const { data, status } = usePolledRequest(loader, 0, true);

  return {
    workers: data?.workers ?? null,
    status,
    refresh: () => setRevision((current) => current + 1),
  };
}

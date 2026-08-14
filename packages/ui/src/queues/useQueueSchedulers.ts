import { useCallback, useState } from 'react';
import { fetchJobSchedulers } from '../api/contract';
import { usePolledRequest } from '../api/usePolledRequest';

/**
 * A queue's schedulers, fetched on mount and on demand after mutations —
 * not polled: the list answers "what is scheduled", which changes only when
 * someone edits it.
 */
export function useQueueSchedulers(queueName: string) {
  const [revision, setRevision] = useState(0);

  const loader = useCallback(() => fetchJobSchedulers(queueName), [queueName, revision]);

  const { data, status } = usePolledRequest(loader, 0, true);

  return {
    schedulers: data?.schedulers ?? [],
    status,
    refresh: () => setRevision((current) => current + 1),
  };
}

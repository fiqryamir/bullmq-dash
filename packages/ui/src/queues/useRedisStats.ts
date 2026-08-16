import { useCallback, useState } from 'react';
import { fetchRedisStats } from '../api/contract';
import { usePolledRequest } from '../api/usePolledRequest';

/**
 * The Redis stats of the backing store. Fetched on demand — the numbers
 * change slowly and the view has a refresh button.
 */
export function useRedisStats() {
  const [revision, setRevision] = useState(0);

  const loader = useCallback(() => fetchRedisStats(), [revision]);

  const { data, status } = usePolledRequest(loader, 0, true);

  return {
    stats: data,
    status,
    refresh: () => setRevision((current) => current + 1),
  };
}

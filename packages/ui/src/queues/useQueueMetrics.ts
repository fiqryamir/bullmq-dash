import { useCallback, useState } from 'react';
import { fetchQueueMetrics } from '../api/contract';
import { usePolledRequest } from '../api/usePolledRequest';

/** The read windows the metrics view offers. */
export type MetricsRange = '24h' | '7d';

const HOUR_MS = 60 * 60 * 1000;

export function useQueueMetrics(queueName: string, range: MetricsRange) {
  const [revision, setRevision] = useState(0);

  // History is fetched on demand — range changes and the refresh button —
  // rather than polled: the view answers "what happened", not "what is
  // happening", so a 5s poll would only add load.
  const loader = useCallback(() => {
    const to = Date.now();
    const from = to - (range === '7d' ? 7 * 24 * HOUR_MS : 24 * HOUR_MS);
    return fetchQueueMetrics(queueName, from, to);
  }, [queueName, range, revision]);

  const { data, status } = usePolledRequest(loader, 0, true);

  return {
    buckets: data?.buckets ?? [],
    status,
    refresh: () => setRevision((current) => current + 1),
  };
}

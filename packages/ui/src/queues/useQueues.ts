import { useEffect, useState } from 'react';
import { fetchQueues, type AppQueue } from '../api/contract';

export type QueuesStatus = 'loading' | 'ready' | 'error';

export function useQueues(pollingInterval?: number) {
  const [queues, setQueues] = useState<AppQueue[]>([]);
  const [status, setStatus] = useState<QueuesStatus>('loading');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetchQueues();
        if (!cancelled) {
          setQueues(response.queues);
          setStatus('ready');
        }
      } catch {
        if (!cancelled) {
          setStatus('error');
        }
      }
    };

    void load();

    let timer: ReturnType<typeof setInterval> | undefined;
    if (pollingInterval && pollingInterval > 0) {
      timer = setInterval(() => void load(), pollingInterval);
    }

    return () => {
      cancelled = true;
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [pollingInterval]);

  return { queues, status };
}

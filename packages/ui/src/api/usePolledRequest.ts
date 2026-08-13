import { useEffect, useState } from 'react';

export type RequestStatus = 'loading' | 'ready' | 'error';

/**
 * Fetches through `loader` on mount and every `pollingInterval` ms, tracking
 * the request status. When `resetOnStart` is set, stale data is dropped the
 * moment the loader changes (state/page switches) instead of lingering until
 * the fresh response lands.
 */
export function usePolledRequest<T>(
  loader: () => Promise<T>,
  pollingInterval?: number,
  resetOnStart = false
): { data: T | undefined; status: RequestStatus } {
  const [data, setData] = useState<T | undefined>();
  const [status, setStatus] = useState<RequestStatus>('loading');

  useEffect(() => {
    let cancelled = false;

    if (resetOnStart) {
      setData(undefined);
    }
    setStatus('loading');

    const load = async () => {
      try {
        const result = await loader();
        if (!cancelled) {
          setData(result);
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
  }, [loader, pollingInterval, resetOnStart]);

  return { data, status };
}

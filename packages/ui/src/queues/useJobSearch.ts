import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSearch, type JobStatus, type SearchResult } from '../api/contract';

export const SEARCH_DEBOUNCE_MS = 300;

export type JobSearchStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Live job search for the command palette: the term is debounced for 300ms
 * before the cross-queue search endpoint is hit, and the palette's state chip
 * selection narrows the request. When the response reports `deepen`, the
 * palette can fetch the next scan window and append its results.
 */
export function useJobSearch(term: string, statuses: JobStatus[]) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<JobSearchStatus>('idle');
  const [scanned, setScanned] = useState(0);
  const [deepen, setDeepen] = useState(false);

  const trimmed = term.trim();
  const statusesKey = statuses.join(',');

  // Bumped on every search change and every deepen call; a response whose
  // id no longer matches is stale (a newer term is being searched) and is
  // dropped instead of corrupting the results or the continuation offset.
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    setScanned(0);
    setDeepen(false);

    if (!trimmed) {
      setResults([]);
      setStatus('idle');
      return;
    }

    let cancelled = false;
    setStatus('loading');

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetchSearch(trimmed, statuses, 0);
          if (!cancelled && requestId === requestIdRef.current) {
            setResults(response.results);
            setScanned(response.totalScanned);
            setDeepen(response.deepen);
            setStatus('ready');
          }
        } catch {
          if (!cancelled && requestId === requestIdRef.current) {
            setStatus('error');
          }
        }
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, statusesKey]);

  const deepenSearch = useCallback(async () => {
    if (!trimmed) {
      return;
    }

    const requestId = ++requestIdRef.current;
    setStatus('loading');
    try {
      const response = await fetchSearch(trimmed, statuses, scanned);
      if (requestId !== requestIdRef.current) {
        return;
      }
      setResults((current) => [...current, ...response.results]);
      setScanned(scanned + response.totalScanned);
      setDeepen(response.deepen);
      setStatus('ready');
    } catch {
      if (requestId === requestIdRef.current) {
        setStatus('error');
      }
    }
  }, [trimmed, statuses, scanned]);

  return { results, status, deepen, deepenSearch };
}

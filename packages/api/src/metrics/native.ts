import { METRICS_MINUTE_MS } from './store';

/**
 * BullMQ's native per-minute counters, as returned by `queue.getMetrics`.
 * `data[0]` is the newest point — it covers the minute containing
 * `meta.prevTS` — and `meta.count - meta.prevCount` counts the jobs that
 * finished in that same minute after the newest point was recorded.
 */
export interface NativeMetrics {
  meta: {
    count: number;
    prevTS: number;
    prevCount: number;
  };
  data: number[];
  count: number;
}

/**
 * Aligns the native per-minute counters to absolute minute indexes so they
 * can be merged with the dashboard's own event-derived buckets. The native
 * counters keep recording while the dashboard is down, which is exactly the
 * gap the merge must close; they only record when the embedded host's
 * workers opt in (`maxMetricsSize` on v5 queues, `metrics.maxDataPoints` on
 * v6 workers), so the result is empty for queues without that configuration.
 */
export function alignNativeMetrics(metrics: NativeMetrics, now = Date.now()): Map<number, number> {
  const byMinute = new Map<number, number>();
  const { prevTS, prevCount, count } = metrics.meta;
  if (prevTS <= 0) {
    return byMinute;
  }

  const newestMinute = Math.floor(prevTS / METRICS_MINUTE_MS);
  metrics.data.forEach((value, offset) => {
    if (value > 0) {
      byMinute.set(newestMinute - offset, value);
    }
  });

  // Jobs finished since the last recorded point are not in `data`; they sit
  // in the current partial minute, and sum with the newest point when the
  // last write happened in that same minute.
  const inFlight = count - prevCount;
  if (inFlight > 0) {
    const minute = Math.floor(now / METRICS_MINUTE_MS);
    byMinute.set(minute, (byMinute.get(minute) ?? 0) + inFlight);
  }

  return byMinute;
}

import type { MetricsBucket } from '../api/contract';

/**
 * Collapses minute buckets into coarser windows (used for the 7-day range).
 * Counts sum exactly; duration and wait average the minute-level averages of
 * the window (a trend-level approximation — the endpoint only serves
 * averages, not per-minute sample counts).
 */
export function aggregateBuckets(buckets: MetricsBucket[], bucketMs: number): MetricsBucket[] {
  type Window = {
    ts: number;
    completed: number;
    failed: number;
    duration: number[];
    wait: number[];
  };

  const windows = new Map<number, Window>();
  for (const bucket of buckets) {
    const ts = Math.floor(bucket.ts / bucketMs) * bucketMs;
    const window = windows.get(ts) ?? { ts, completed: 0, failed: 0, duration: [], wait: [] };
    window.completed += bucket.completed;
    window.failed += bucket.failed;
    if (bucket.durationAvgMs !== null) {
      window.duration.push(bucket.durationAvgMs);
    }
    if (bucket.waitAvgMs !== null) {
      window.wait.push(bucket.waitAvgMs);
    }
    windows.set(ts, window);
  }

  const average = (samples: number[]): number | null =>
    samples.length === 0 ? null : Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length);

  return [...windows.values()].map((window) => ({
    ts: window.ts,
    completed: window.completed,
    failed: window.failed,
    durationAvgMs: average(window.duration),
    waitAvgMs: average(window.wait),
  }));
}

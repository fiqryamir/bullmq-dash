import { alignNativeMetrics } from '../metrics/native';
import { getMetricsStore } from '../metrics/registry';
import { DEFAULT_METRICS_RETENTION_SECONDS, METRICS_MINUTE_MS, minuteIndex } from '../metrics/store';
import type {
  BullBoardRequest,
  ControllerHandlerReturnType,
  MetricsBucket,
} from '../typings/app';
import { stringValue } from './query';

/** The read window served when the request does not ask for one — 24 hours. */
export const DEFAULT_METRICS_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The widest range the endpoint serves when no metrics store is registered
 * (buckets expire at the store's retention, so the store's own setting is
 * the real cap whenever one exists).
 */
export const FALLBACK_METRICS_RANGE_MS = DEFAULT_METRICS_RETENTION_SECONDS * 1000;

function parseWindow(query: Record<string, unknown>): { from: number; to: number } | null {
  const now = Date.now();
  const fromRaw = stringValue(query, 'from');
  const toRaw = stringValue(query, 'to');
  const from = fromRaw === undefined ? now - DEFAULT_METRICS_WINDOW_MS : Number(fromRaw);
  const to = toRaw === undefined ? now : Number(toRaw);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return null;
  }
  return { from, to };
}

export async function metricsHandler(
  req: BullBoardRequest
): Promise<ControllerHandlerReturnType> {
  const queueName = String(req.params.queueName ?? '');
  const queue = req.queues.get(queueName);
  if (!queue || !(await queue.isVisible(req))) {
    return { status: 404, body: {} };
  }

  const window = parseWindow(req.query);
  if (!window) {
    return { status: 400, body: {} };
  }
  const store = getMetricsStore(req.queues);
  const maxRangeMs = (store?.bucketRetentionSeconds ?? DEFAULT_METRICS_RETENTION_SECONDS) * 1000;
  const from = Math.max(window.from, window.to - maxRangeMs);
  const to = window.to;

  const fromMinute = minuteIndex(from);
  const toMinute = minuteIndex(to);
  if (fromMinute > toMinute) {
    return { status: 400, body: {} };
  }

  const stored = store ? await store.getBuckets(queueName, fromMinute, toMinute) : [];
  const storedByMinute = new Map(stored.map((bucket) => [bucket.minute, bucket]));

  // Counts are the max of what the dashboard captured from events and what
  // the workers recorded natively while the dashboard was down.
  const [nativeCompleted, nativeFailed] = await Promise.all([
    alignNativeMetrics(await queue.getMetrics('completed')),
    alignNativeMetrics(await queue.getMetrics('failed')),
  ]);

  const buckets: MetricsBucket[] = [];
  for (let minute = fromMinute; minute <= toMinute; minute += 1) {
    const raw = storedByMinute.get(minute);
    buckets.push({
      ts: minute * METRICS_MINUTE_MS,
      completed: Math.max(raw?.completed ?? 0, nativeCompleted.get(minute) ?? 0),
      failed: Math.max(raw?.failed ?? 0, nativeFailed.get(minute) ?? 0),
      durationAvgMs:
        raw && raw.durationCount > 0 ? Math.round(raw.durationSum / raw.durationCount) : null,
      waitAvgMs: raw && raw.waitCount > 0 ? Math.round(raw.waitSum / raw.waitCount) : null,
    });
  }

  return { body: { queue: queueName, buckets } };
}

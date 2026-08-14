import { describe, expect, it } from 'vitest';
import type { MetricsBucket } from '../api/contract';
import { aggregateBuckets } from './metricsDownsample';

const bucket = (ts: number, overrides: Partial<MetricsBucket> = {}): MetricsBucket => ({
  ts,
  completed: 0,
  failed: 0,
  durationAvgMs: null,
  waitAvgMs: null,
  ...overrides,
});

describe('aggregateBuckets', () => {
  it('sums counts across the aggregated window', () => {
    const aggregated = aggregateBuckets(
      [
        bucket(1_700_000_000_000, { completed: 2, failed: 1 }),
        bucket(1_700_000_060_000, { completed: 3 }),
        bucket(1_700_003_600_000, { completed: 4 }),
      ],
      3_600_000
    );

    expect(aggregated).toHaveLength(2);
    expect(aggregated[0]).toMatchObject({ ts: 1_700_000_400_000, completed: 5, failed: 1 });
    expect(aggregated[1]).toMatchObject({ ts: 1_700_003_600_000, completed: 4, failed: 0 });
  });

  it('averages the per-minute duration and wait samples', () => {
    const aggregated = aggregateBuckets(
      [
        bucket(1_700_000_000_000, { durationAvgMs: 100, waitAvgMs: 40 }),
        bucket(1_700_000_060_000, { durationAvgMs: 200, waitAvgMs: 60 }),
      ],
      3_600_000
    );

    expect(aggregated[0]!.durationAvgMs).toBe(150);
    expect(aggregated[0]!.waitAvgMs).toBe(50);
  });

  it('keeps averages null when a window has no samples', () => {
    const aggregated = aggregateBuckets(
      [bucket(1_700_000_000_000, { completed: 1 }), bucket(1_700_000_060_000, { completed: 2 })],
      3_600_000
    );

    expect(aggregated[0]!.durationAvgMs).toBeNull();
    expect(aggregated[0]!.waitAvgMs).toBeNull();
    expect(aggregated[0]!.completed).toBe(3);
  });

  it('aligns the aggregated window to the requested bucket size', () => {
    const aggregated = aggregateBuckets(
      [bucket(1_700_000_000_000, { completed: 1 }), bucket(1_700_000_060_000, { completed: 1 })],
      1_800_000
    );

    expect(aggregated[0]!.ts).toBe(1_700_000_400_000);
    expect(aggregated).toHaveLength(1);
  });

  it('answers an empty list for no buckets', () => {
    expect(aggregateBuckets([], 3_600_000)).toEqual([]);
  });
});

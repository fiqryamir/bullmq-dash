import { describe, expect, it } from 'vitest';
import { alignNativeMetrics, type NativeMetrics } from './native';

describe('alignNativeMetrics', () => {
  const native = (meta: NativeMetrics['meta'], data: number[]): NativeMetrics => ({
    meta,
    data,
    count: data.length,
  });

  it('maps every native data point to its absolute minute', () => {
    // data[0] is the newest point, sitting in the minute of meta.prevTS.
    const aligned = alignNativeMetrics(
      native({ count: 3, prevTS: 1_800_000, prevCount: 10 }, [4, 2, 1])
    );

    expect(aligned.get(30)).toBe(4);
    expect(aligned.get(29)).toBe(2);
    expect(aligned.get(28)).toBe(1);
  });

  it('counts the in-flight partial minute from the cumulative counters', () => {
    // The newest point holds two jobs in minute 1; three more finished after
    // the last write and are attributed to the current minute (minute 2).
    const aligned = alignNativeMetrics(
      native({ count: 5, prevTS: 90_000, prevCount: 2 }, [2, 1]),
      150_000
    );

    expect(aligned.get(2)).toBe(3);
    expect(aligned.get(1)).toBe(2);
    expect(aligned.get(0)).toBe(1);
  });

  it('sums the newest point with in-flight jobs in the same minute', () => {
    // The last write happened in the current minute (minute 1): the two jobs
    // it pushed and the three still in-flight all belong to that minute.
    const aligned = alignNativeMetrics(
      native({ count: 5, prevTS: 90_000, prevCount: 2 }, [2]),
      90_000
    );

    expect(aligned.get(1)).toBe(5);
  });

  it('ignores zero-valued points', () => {
    const aligned = alignNativeMetrics(
      native({ count: 3, prevTS: 60_000, prevCount: 5 }, [3, 0, 2])
    );

    expect(aligned.has(1)).toBe(true);
    expect(aligned.has(0)).toBe(false);
    expect(aligned.has(-1)).toBe(true);
  });

  it('answers an empty map for a queue with no native metrics', () => {
    const aligned = alignNativeMetrics(native({ count: 0, prevTS: 0, prevCount: 0 }, []));
    expect(aligned.size).toBe(0);
  });

  it('does not invent a partial minute when prevTS is unknown', () => {
    const aligned = alignNativeMetrics(native({ count: 0, prevTS: 0, prevCount: 0 }, [5]));
    expect(aligned.size).toBe(0);
  });

  it('skips the partial minute when no job finished after the last point', () => {
    const aligned = alignNativeMetrics(
      native({ count: 2, prevTS: 60_000, prevCount: 2 }, [2])
    );
    expect(aligned.get(1)).toBe(2);
    expect(aligned.has(2)).toBe(false);
  });
});

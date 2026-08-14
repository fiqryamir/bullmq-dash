import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SearchResponse } from '../api/contract';
import { makeJob } from '../testUtils/fixtures';
import { SEARCH_DEBOUNCE_MS, useJobSearch } from './useJobSearch';

function stubSearchApi(overrides: Partial<SearchResponse> = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      term: '',
      count: 0,
      totalScanned: 0,
      deepen: false,
      results: [],
      ...overrides,
    }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useJobSearch', () => {
  it('debounces the term for 300ms before fetching', async () => {
    vi.useFakeTimers();
    const fetchMock = stubSearchApi();
    const { rerender } = renderHook(({ term }) => useJobSearch(term, []), {
      initialProps: { term: '' },
    });

    rerender({ term: 'mail' });
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetches with the trimmed term and the selected states', async () => {
    vi.useFakeTimers();
    const fetchMock = stubSearchApi();
    const { rerender } = renderHook(({ term }) => useJobSearch(term, ['failed', 'delayed']), {
      initialProps: { term: '' },
    });

    rerender({ term: '  mail-1  ' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(fetchMock).toHaveBeenCalledWith('api/search?term=mail-1&status=failed%2Cdelayed');
  });

  it('does not fetch when the term is blank', async () => {
    vi.useFakeTimers();
    const fetchMock = stubSearchApi();
    const { rerender } = renderHook(({ term }) => useJobSearch(term, []), {
      initialProps: { term: '' },
    });

    rerender({ term: '   ' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('restarts the debounce when the term changes mid-flight', async () => {
    vi.useFakeTimers();
    const fetchMock = stubSearchApi();
    const { rerender } = renderHook(({ term }) => useJobSearch(term, []), {
      initialProps: { term: '' },
    });

    rerender({ term: 'mail' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    rerender({ term: 'mail-later' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('term=mail-later');
  });

  it('exposes the matched results and deepen flag', async () => {
    vi.useFakeTimers();
    const fetchMock = stubSearchApi({
      term: 'mail',
      count: 1,
      totalScanned: 3,
      deepen: true,
      results: [
        {
          queue: 'emails',
          job: makeJob(0, { id: 'mail-1' }),
          state: 'waiting',
        },
      ],
    });
    const { result } = renderHook(() => useJobSearch('mail', []));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('ready');
    expect(result.current.results).toHaveLength(1);
    expect(result.current.results[0]).toMatchObject({
      queue: 'emails',
      state: 'waiting',
      job: { id: 'mail-1' },
    });
    expect(result.current.deepen).toBe(true);
  });

  it('deepens the search and appends the next page of results', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          term: 'mail',
          count: 1,
          totalScanned: 3,
          deepen: true,
          results: [{ queue: 'emails', job: makeJob(0, { id: 'mail-1' }), state: 'waiting' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          term: 'mail',
          count: 1,
          totalScanned: 2,
          deepen: false,
          results: [{ queue: 'emails', job: makeJob(1, { id: 'mail-2' }), state: 'waiting' }],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useJobSearch('mail', []));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    await act(async () => {
      await result.current.deepenSearch();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toContain('start=3');
    expect(result.current.results.map((entry) => entry.job.id)).toEqual(['mail-1', 'mail-2']);
    expect(result.current.deepen).toBe(false);
  });

  it('drops a stale deepen response when the term changes mid-flight', async () => {
    vi.useFakeTimers();
    let resolveDeepen: (value: unknown) => void;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          term: 'mail',
          count: 1,
          totalScanned: 2,
          deepen: true,
          results: [{ queue: 'emails', job: makeJob(0, { id: 'mail-1' }), state: 'waiting' }],
        }),
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveDeepen = resolve;
          })
      )
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          term: 'mail-2',
          count: 1,
          totalScanned: 1,
          deepen: false,
          results: [{ queue: 'emails', job: makeJob(1, { id: 'mail-2' }), state: 'waiting' }],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(({ term }) => useJobSearch(term, []), {
      initialProps: { term: 'mail' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(result.current.results.map((entry) => entry.job.id)).toEqual(['mail-1']);

    const deepenPromise = result.current.deepenSearch();
    rerender({ term: 'mail-2' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    resolveDeepen!({
      ok: true,
      status: 200,
      json: async () => ({
        term: 'mail',
        count: 1,
        totalScanned: 2,
        deepen: false,
        results: [{ queue: 'emails', job: makeJob(2, { id: 'mail-3' }), state: 'waiting' }],
      }),
    });
    await act(async () => {
      await deepenPromise;
    });

    expect(result.current.results.map((entry) => entry.job.id)).toEqual(['mail-2']);
    expect(result.current.deepen).toBe(false);
  });

  it('scopes the request to a queue when one is given', async () => {
    vi.useFakeTimers();
    const fetchMock = stubSearchApi();
    const { result } = renderHook(() => useJobSearch('mail', [], 'emails'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(fetchMock).toHaveBeenCalledWith('api/queues/emails/search?term=mail');
    expect(result.current.status).toBe('ready');
  });

  it('reports a failed search', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down'))
    );
    const { result } = renderHook(() => useJobSearch('mail', []));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.status).toBe('error');
  });

  it('goes idle when the term is cleared', async () => {
    vi.useFakeTimers();
    stubSearchApi();
    const { result, rerender } = renderHook(({ term }) => useJobSearch(term, []), {
      initialProps: { term: 'mail' },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(result.current.status).toBe('ready');

    rerender({ term: '' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.results).toEqual([]);
  });
});

describe('SEARCH_DEBOUNCE_MS', () => {
  it('is 300ms', () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(300);
  });
});

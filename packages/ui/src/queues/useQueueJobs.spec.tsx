import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppJob, JobStatus, JobsPagination, QueueJobsResponse } from '../api/contract';
import { useQueueJobs } from './useQueueJobs';

function makeJob(overrides: Partial<AppJob>): AppJob {
  return {
    id: '1',
    name: 'mail-job',
    state: 'waiting',
    progress: 0,
    attempts: 0,
    timestamp: 1700000000000,
    stacktrace: [],
    opts: { attempts: 1 },
    data: {},
    ...overrides,
  };
}

function stubJobsResponse(response: QueueJobsResponse) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => response,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useQueueJobs', () => {
  it('fetches the queue jobs endpoint and exposes the jobs with their pagination', async () => {
    const pagination: JobsPagination = { pageCount: 2, range: { start: 0, end: 49 } };
    const fetchMock = stubJobsResponse({ jobs: [makeJob({ id: '7' })], pagination });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useQueueJobs('emails', 'waiting', 1, 50, 0));

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.jobs).toEqual([expect.objectContaining({ id: '7' })]);
    expect(result.current.pagination).toEqual(pagination);
    expect(fetchMock).toHaveBeenCalledWith('api/queues/emails/jobs?status=waiting&page=1&jobsPerPage=50');
  });

  it('refetches when the state or page changes', async () => {
    const fetchMock = stubJobsResponse({
      jobs: [makeJob({ id: '1' })],
      pagination: { pageCount: 1, range: { start: 0, end: 49 } },
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(
      ({ status, page }: { status: JobStatus; page: number }) =>
        useQueueJobs('emails', status, page, 50, 0),
      { initialProps: { status: 'waiting' as JobStatus, page: 1 } }
    );

    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ status: 'failed', page: 2 });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('api/queues/emails/jobs?status=failed&page=2&jobsPerPage=50')
    );
  });

  it('polls for fresh jobs on the interval', async () => {
    vi.useFakeTimers();
    const fetchMock = stubJobsResponse({
      jobs: [makeJob({ id: '1' })],
      pagination: { pageCount: 1, range: { start: 0, end: 49 } },
    });
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() => useQueueJobs('emails', 'waiting', 1, 50, 5000));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports an error when the jobs request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const { result } = renderHook(() => useQueueJobs('emails', 'waiting', 1, 50, 0));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.jobs).toEqual([]);
  });
});

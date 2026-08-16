import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MetricsBucket } from '../api/contract';
import { ThemeProvider } from '../theme/ThemeProvider';
import { makeQueue } from '../testUtils/fixtures';
import { QueueMetrics } from './QueueMetrics';

const HOUR = 3_600_000;
const NOW = 1_700_000_000_000;

const bucket = (minutesAgo: number, overrides: Partial<MetricsBucket> = {}): MetricsBucket => ({
  ts: NOW - minutesAgo * 60_000,
  completed: 0,
  failed: 0,
  durationAvgMs: null,
  waitAvgMs: null,
  ...overrides,
});

function metricsResponse(buckets: MetricsBucket[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ queue: 'emails', buckets }),
  };
}

function stubMetricsApi(buckets: MetricsBucket[]) {
  const fetchMock = vi.fn().mockResolvedValue(metricsResponse(buckets));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function renderQueueMetrics(onBack = () => {}) {
  return render(
    <ThemeProvider>
      <QueueMetrics queue={makeQueue()} onBack={onBack} onSelectView={() => {}} showMetrics />
    </ThemeProvider>
  );
}

describe('QueueMetrics', () => {
  it('fetches the last 24 hours on mount', async () => {
    const fetchMock = stubMetricsApi([]);
    renderQueueMetrics();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toMatch(/^api\/queues\/emails\/metrics\?/);
    const params = new URLSearchParams(url.split('?')[1]);
    expect(Number(params.get('to'))).toBeGreaterThan(Number(params.get('from')));
    expect(Number(params.get('to')) - Number(params.get('from'))).toBe(24 * HOUR);
  });

  it('summarizes the window and renders the three charts', async () => {
    stubMetricsApi([
      bucket(0, { completed: 2, failed: 1, durationAvgMs: 200, waitAvgMs: 50 }),
      bucket(1, { completed: 3, durationAvgMs: 100, waitAvgMs: 30 }),
      bucket(2, { failed: 1 }),
    ]);
    renderQueueMetrics();

    expect(await screen.findByText(/5 completed, 2 failed in the last 24 hours/i)).toBeInTheDocument();
    expect(screen.getByText(/150 ms average duration/i)).toBeInTheDocument();
    expect(screen.getByText(/40 ms average wait/i)).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Counts' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Duration' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Wait time' })).toBeInTheDocument();
  });

  it('shows the empty state when the window has no activity', async () => {
    stubMetricsApi([bucket(0), bucket(1), bucket(2)]);
    renderQueueMetrics();

    expect(
      await screen.findByText(/no completed or failed jobs in this window/i)
    ).toBeInTheDocument();
  });

  it('shows an error state when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    renderQueueMetrics();

    expect(await screen.findByText(/failed to load metrics/i)).toBeInTheDocument();
  });

  it('refetches through the refresh button', async () => {
    const fetchMock = stubMetricsApi([]);
    renderQueueMetrics();
    await screen.findByText(/no completed or failed jobs/i);

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('switches to a 7-day window that aggregates the minutes', async () => {
    const buckets = Array.from({ length: 168 }, (_, index) => bucket(index, { completed: 1 }));
    const fetchMock = stubMetricsApi(buckets);
    renderQueueMetrics();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const url = fetchMock.mock.calls[1]![0] as string;
    const params = new URLSearchParams(url.split('?')[1]);
    expect(Number(params.get('to')) - Number(params.get('from'))).toBe(7 * 24 * HOUR);

    // The 7-day chart aggregates to hourly windows: 168 minutes collapse.
    await waitFor(() => expect(screen.getByText(/168 completed/i)).toBeInTheDocument());
    fireEvent.click(screen.getByText('Data table'));
    const details = screen.getByRole('group', { name: /data table/i });
    const rows = within(details).getAllByRole('row');
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.length).toBeLessThan(168);
  });

  it('lists the minute buckets in the data table fallback', async () => {
    stubMetricsApi([
      bucket(0, { completed: 2, failed: 1, durationAvgMs: 200, waitAvgMs: 50 }),
      bucket(1, { completed: 3, durationAvgMs: 100, waitAvgMs: 30 }),
    ]);
    renderQueueMetrics();
    await screen.findByText(/5 completed/i);

    fireEvent.click(screen.getByText('Data table'));
    const details = screen.getByRole('group', { name: /data table/i });
    expect(within(details).getAllByRole('row')).toHaveLength(3);
    expect(within(details).getByText('2')).toBeInTheDocument();
    expect(within(details).getByText('200 ms')).toBeInTheDocument();
  });

  it('renders the back button to leave the view', async () => {
    stubMetricsApi([]);
    const onBack = vi.fn();
    renderQueueMetrics(onBack);

    fireEvent.click(await screen.findByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});


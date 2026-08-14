import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { AppJob, AppQueue } from './api/contract';
import { COUNTS, makeJob, makeQueue } from './testUtils/fixtures';
import { THEME_STORAGE_KEY } from './theme/constants';

function stubQueuesApi(...queues: AppQueue[]) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ queues }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function stubDashboardApi(queues: AppQueue[], jobs: AppJob[] = []) {
  return vi.fn((url: string) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: async () =>
        String(url).startsWith('api/queues') && !String(url).includes('/jobs')
          ? { queues }
          : {
              jobs,
              pagination: { pageCount: 1, range: { start: 0, end: 99 } },
            },
    })
  );
}

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('App shell', () => {
  it('renders the queues list from the REST contract', async () => {
    stubQueuesApi(
      makeQueue({
        name: 'emails',
        counts: { ...COUNTS, active: 0, waiting: 43, completed: 0, failed: 3, delayed: 0 },
      }),
      makeQueue({
        name: 'billing',
        counts: { ...COUNTS, active: 0, waiting: 0, completed: 3820, failed: 0, delayed: 2 },
      })
    );
    render(<App uiConfig={{ pollingInterval: { forceInterval: 0 } }} />);
    expect(await screen.findByText('emails')).toBeInTheDocument();
    expect(screen.getByText('billing')).toBeInTheDocument();
    expect(screen.getByText('43')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('3820')).toBeInTheDocument();
  });

  it('is dark by default and toggles to light', async () => {
    stubQueuesApi();
    const user = userEvent.setup();
    render(<App uiConfig={{ pollingInterval: { forceInterval: 0 } }} />);
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    await user.click(screen.getByRole('switch', { name: 'Toggle theme' }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('refreshes the queues list live on the polling interval', async () => {
    vi.useFakeTimers();
    const fetchMock = stubQueuesApi(makeQueue({ name: 'emails' }));
    render(<App />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('emails')).toBeInTheDocument();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        queues: [makeQueue({ name: 'emails' }), makeQueue({ name: 'webhooks' })],
      }),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByText('webhooks')).toBeInTheDocument();
  });

  it('filters queues through the command bar', async () => {
    stubQueuesApi(makeQueue({ name: 'emails' }), makeQueue({ name: 'billing' }));
    const user = userEvent.setup();
    render(<App uiConfig={{ pollingInterval: { forceInterval: 0 } }} />);
    await screen.findByText('emails');
    await user.type(screen.getByRole('searchbox', { name: 'Search queues' }), 'bill');
    expect(screen.getByText('billing')).toBeInTheDocument();
    expect(screen.queryByText('emails')).not.toBeInTheDocument();
  });

  it('shows an error state when the queues request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    render(<App uiConfig={{ pollingInterval: { forceInterval: 0 } }} />);
    expect(await screen.findByText(/failed to load queues/i)).toBeInTheDocument();
  });

  it('opens the jobs view of a queue and returns back', async () => {
    const fetchMock = stubDashboardApi(
      [makeQueue({ name: 'emails', counts: { ...COUNTS, waiting: 43 } })],
      [makeJob(0, { id: 'emails:77431', name: 'welcome-email', progress: 100 })]
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<App uiConfig={{ pollingInterval: { forceInterval: 0 } }} />);
    await user.click(await screen.findByRole('button', { name: /emails/ }));

    expect(await screen.findByText('welcome-email')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Job states' })).toBeInTheDocument();
    expect(screen.queryByRole('searchbox', { name: 'Search queues' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(await screen.findByRole('searchbox', { name: 'Search queues' })).toBeInTheDocument();
  });

  it('opens the detail of a job from the jobs view and returns to it', async () => {
    const fetchMock = vi.fn((url: string) => {
      const target = String(url);
      if (target.includes('/logs')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            logs: ['log row'],
            count: 1,
            pagination: { pageCount: 1, range: { start: 0, end: 99 } },
          }),
        });
      }
      if (target.includes('/jobs')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            jobs: [
              makeJob(0, {
                id: 'f1',
                name: 'welcome-email',
                state: 'failed',
                failedReason: 'kaboom',
                stacktrace: ['Error: kaboom'],
              }),
            ],
            pagination: { pageCount: 1, range: { start: 0, end: 99 } },
          }),
        });
      }
      if (target.includes('api/queues/emails/f1')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            job: makeJob(0, {
              id: 'f1',
              name: 'welcome-email',
              failedReason: 'kaboom',
              stacktrace: ['Error: kaboom'],
              data: { to: 'a@example.com' },
            }),
            status: 'failed',
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ queues: [makeQueue({ name: 'emails' })] }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<App uiConfig={{ pollingInterval: { forceInterval: 0 } }} />);
    await user.click(await screen.findByRole('button', { name: /emails/ }));
    await user.click(await screen.findByText('welcome-email'));

    expect(await screen.findByText('kaboom')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Logs' })).toBeInTheDocument();
    expect(screen.getByText('#f1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(await screen.findByRole('group', { name: 'Job states' })).toBeInTheDocument();
  });

  it('opens the flow view of a queue and lands on a job from a graph node', async () => {
    const fetchMock = vi.fn((url: string) => {
      const target = String(url);
      if (target === 'api/queues/emails/flow') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            roots: [
              {
                id: 'r1',
                name: 'root-job',
                state: 'waiting-children',
                progress: 0,
                queueName: 'emails',
                children: [
                  {
                    id: 'c1',
                    name: 'child-job',
                    state: 'waiting',
                    progress: 0,
                    queueName: 'emails',
                    children: [],
                  },
                ],
              },
            ],
            nodeCount: 2,
            truncated: false,
          }),
        });
      }
      if (target.endsWith('/flow')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            nodeId: 'r1',
            isFlowNode: true,
            flowRoot: {
              id: 'r1',
              name: 'root-job',
              state: 'waiting-children',
              progress: 0,
              queueName: 'emails',
              children: [
                {
                  id: 'c1',
                  name: 'child-job',
                  state: 'waiting',
                  progress: 0,
                  queueName: 'emails',
                  children: [],
                },
              ],
            },
          }),
        });
      }
      if (target.includes('/logs')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ logs: [], count: 0, pagination: { pageCount: 0, range: { start: 0, end: 99 } } }),
        });
      }
      if (target.includes('/jobs')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            jobs: [makeJob(0, { id: 'c1', name: 'child-job', state: 'waiting' })],
            pagination: { pageCount: 1, range: { start: 0, end: 99 } },
          }),
        });
      }
      if (target.includes('api/queues/emails/c1')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            job: makeJob(0, { id: 'c1', name: 'child-job', state: 'waiting', data: { to: 'a@example.com' } }),
            status: 'waiting',
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ queues: [makeQueue({ name: 'emails' })] }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<App uiConfig={{ pollingInterval: { forceInterval: 0 } }} />);
    await user.click(await screen.findByRole('button', { name: /emails/ }));

    await user.click(screen.getByRole('button', { name: 'Open flow view' }));
    expect(await screen.findByText('root-job')).toBeInTheDocument();

    fireEvent.click(screen.getByText('child-job'));
    expect(await screen.findByRole('region', { name: 'Job data' })).toBeInTheDocument();
    expect(screen.getAllByText('#c1').length).toBeGreaterThan(0);
  });

  it('opens the metrics view of a queue', async () => {
    const fetchMock = vi.fn((url: string) => {
      const target = String(url);
      if (target.startsWith('api/queues/emails/metrics')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            queue: 'emails',
            buckets: [
              { ts: 1700000000000, completed: 2, failed: 1, durationAvgMs: 120, waitAvgMs: 40 },
            ],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ queues: [makeQueue({ name: 'emails' })] }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<App uiConfig={{ pollingInterval: { forceInterval: 0 } }} />);
    await user.click(await screen.findByRole('button', { name: /emails/ }));

    await user.click(screen.getByRole('button', { name: 'Open metrics view' }));
    expect(await screen.findByText(/2 completed, 1 failed in the last 24h/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Counts' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(await screen.findByRole('group', { name: 'Job states' })).toBeInTheDocument();
  });

  it('hides the metrics view when the board config disables it', async () => {
    stubQueuesApi(makeQueue({ name: 'emails' }));
    const user = userEvent.setup();

    render(<App uiConfig={{ pollingInterval: { forceInterval: 0 }, showMetrics: false }} />);
    await user.click(await screen.findByRole('button', { name: /emails/ }));

    expect(screen.queryByRole('button', { name: 'Open metrics view' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open flow view' })).toBeInTheDocument();
  });

  it('lands on a job from the command palette search', async () => {
    const fetchMock = vi.fn((url: string) => {
      const target = String(url);
      if (target.startsWith('api/search')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            term: '77431',
            count: 1,
            totalScanned: 3,
            deepen: false,
            results: [
              {
                queue: 'emails',
                job: makeJob(0, { id: 'emails:77431', name: 'welcome-email' }),
                state: 'completed',
              },
            ],
          }),
        });
      }
      if (target.includes('/logs')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            logs: ['log row'],
            count: 1,
            pagination: { pageCount: 1, range: { start: 0, end: 99 } },
          }),
        });
      }
      if (target.includes('api/queues/emails/emails%3A77431')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            job: makeJob(0, {
              id: 'emails:77431',
              name: 'welcome-email',
              data: { to: 'a@example.com' },
            }),
            status: 'completed',
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ queues: [makeQueue({ name: 'emails' })] }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<App uiConfig={{ pollingInterval: { forceInterval: 0 } }} />);
    await screen.findByText('emails');

    await user.type(screen.getByRole('searchbox', { name: 'Search jobs' }), '77431');
    await user.click(await screen.findByRole('button', { name: /welcome-email/ }));

    expect(await screen.findByText('#emails:77431')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Logs' })).toBeInTheDocument();
    expect(screen.queryByRole('searchbox', { name: 'Search jobs' })).not.toBeInTheDocument();
  });
});

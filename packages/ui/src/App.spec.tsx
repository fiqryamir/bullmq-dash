import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { AppQueue } from './api/contract';
import { THEME_STORAGE_KEY } from './theme/constants';

const COUNTS = {
  latest: 0,
  active: 0,
  waiting: 0,
  'waiting-children': 0,
  prioritized: 0,
  completed: 0,
  failed: 0,
  delayed: 0,
  paused: 0,
};

function makeQueue(overrides: Partial<AppQueue>): AppQueue {
  return {
    name: 'emails',
    counts: { ...COUNTS },
    isPaused: false,
    readOnlyMode: false,
    ...overrides,
  };
}

function stubQueuesApi(...queues: AppQueue[]) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ queues }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
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
      makeQueue({ name: 'emails', counts: { ...COUNTS, waiting: 43, failed: 3 } }),
      makeQueue({ name: 'billing', counts: { ...COUNTS, completed: 3820, delayed: 2 } })
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
    await user.type(screen.getByRole('searchbox'), 'bill');
    expect(screen.getByText('billing')).toBeInTheDocument();
    expect(screen.queryByText('emails')).not.toBeInTheDocument();
  });

  it('shows an error state when the queues request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    render(<App uiConfig={{ pollingInterval: { forceInterval: 0 } }} />);
    expect(await screen.findByText(/failed to load queues/i)).toBeInTheDocument();
  });
});

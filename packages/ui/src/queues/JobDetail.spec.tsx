import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppJob } from '../api/contract';
import { makeQueue } from '../testUtils/fixtures';
import { JobDetail } from './JobDetail';

function detailResponse(job: Partial<AppJob>, status = 'failed') {
  return {
    ok: true,
    status: 200,
    json: async () => ({ job, status }),
  };
}

function logsResponse(logs: string[], pageCount = 1, count = logs.length) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      logs,
      count,
      pagination: { pageCount, range: { start: 0, end: 99 } },
    }),
  };
}

function stubDetailApi(
  job: Partial<AppJob>,
  logs: string[] = [],
  pageCount = 1,
  count = logs.length,
  status = 'failed'
) {
  const fetchMock = vi.fn((url: string): Promise<FetchResponse> => {
    if (String(url).includes('/logs')) {
      return Promise.resolve(logsResponse(logs, pageCount, count));
    }
    return Promise.resolve(detailResponse(job, status));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

type FetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

const failedJob: Partial<AppJob> = {
  id: 'f1',
  name: 'welcome-email',
  timestamp: 1700000000000,
  processedOn: 1700000000100,
  finishedOn: 1700000000200,
  progress: 20,
  attempts: 2,
  failedReason: 'kaboom',
  stacktrace: ['Error: kaboom', '  at run (app.js:1:1)'],
  data: { to: 'a@example.com' },
  opts: { attempts: 2, priority: 3 },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('JobDetail', () => {
  it('renders the state chip and the job meta', async () => {
    stubDetailApi(failedJob);
    render(<JobDetail queue={makeQueue()} jobId="f1" pollingInterval={0} onBack={() => {}} />);

    expect(await screen.findByText('failed')).toBeInTheDocument();
    expect(screen.getByText('#f1')).toBeInTheDocument();
    expect(screen.getByText('welcome-email')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(new Date(1700000000000).toISOString())).toBeInTheDocument();
  });

  it('renders the job data and options as JSON', async () => {
    stubDetailApi(failedJob);
    render(<JobDetail queue={makeQueue()} jobId="f1" pollingInterval={0} onBack={() => {}} />);

    await screen.findByText('failed');
    const data = screen.getByRole('region', { name: 'Job data' });
    expect(within(data).getByText(/a@example\.com/)).toBeInTheDocument();

    const options = screen.getByRole('region', { name: 'Job options' });
    expect(within(options).getByText(/"priority": 3/)).toBeInTheDocument();
  });

  it('renders the failed reason and the stacktrace of a failed job', async () => {
    stubDetailApi(failedJob);
    render(<JobDetail queue={makeQueue()} jobId="f1" pollingInterval={0} onBack={() => {}} />);

    await screen.findByText('failed');
    const reason = screen.getByRole('region', { name: 'Failed reason' });
    expect(within(reason).getByText('kaboom')).toBeInTheDocument();

    const stacktrace = screen.getByRole('region', { name: 'Stacktrace' });
    expect(within(stacktrace).getByText(/Error: kaboom/)).toBeInTheDocument();
  });

  it('renders the return value of a completed job', async () => {
    stubDetailApi(
      {
        id: 'f1',
        name: 'welcome-email',
        timestamp: 1700000000000,
        progress: 42,
        attempts: 1,
        stacktrace: [],
        data: { to: 'a@example.com' },
        opts: { attempts: 1 },
        returnValue: { delivered: true },
      },
      [],
      1,
      0,
      'completed'
    );
    render(<JobDetail queue={makeQueue()} jobId="f1" pollingInterval={0} onBack={() => {}} />);

    await screen.findByText('completed');
    const returnValue = screen.getByRole('region', { name: 'Return value' });
    expect(within(returnValue).getByText(/delivered/)).toBeInTheDocument();
  });

  it('fetches the detail and the first logs page on mount', async () => {
    const fetchMock = stubDetailApi(failedJob, ['log row']);
    render(<JobDetail queue={makeQueue()} jobId="f1" pollingInterval={0} onBack={() => {}} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('api/queues/emails/f1');
      expect(fetchMock).toHaveBeenCalledWith('api/queues/emails/f1/logs?page=1&logsPerPage=100');
    });
  });

  it('lists the log rows newest first', async () => {
    stubDetailApi(failedJob, ['log row 2', 'log row 1'], 1, 2);
    render(<JobDetail queue={makeQueue()} jobId="f1" pollingInterval={0} onBack={() => {}} />);

    await screen.findByText('failed');
    const logs = screen.getByRole('region', { name: 'Logs' });
    const rows = await within(logs).findAllByText(/log row/);
    expect(rows.map((row) => row.textContent)).toEqual(['log row 2', 'log row 1']);
  });

  it('pages through the logs', async () => {
    const fetchMock = stubDetailApi(failedJob, ['log row 5', 'log row 4'], 3, 5);
    const user = userEvent.setup();
    render(<JobDetail queue={makeQueue()} jobId="f1" pollingInterval={0} onBack={() => {}} />);

    const next = await screen.findByRole('button', { name: 'Next logs page' });
    expect(screen.getByText(/page 1 of 3/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous logs page' })).toBeDisabled();

    await user.click(next);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith('api/queues/emails/f1/logs?page=2&logsPerPage=100')
    );
    expect(screen.getByText(/page 2 of 3/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next logs page' }));
    await waitFor(() => expect(screen.getByText(/page 3 of 3/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Next logs page' })).toBeDisabled();
  });

  it('falls back to the last logs page when the log count shrinks', async () => {
    const fetchMock = stubDetailApi(failedJob, ['log row 2'], 2, 2);
    const user = userEvent.setup();
    render(<JobDetail queue={makeQueue()} jobId="f1" pollingInterval={50} onBack={() => {}} />);

    await user.click(await screen.findByRole('button', { name: 'Next logs page' }));
    await waitFor(() => expect(screen.getByText(/page 2 of 2/i)).toBeInTheDocument());

    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/logs') ? logsResponse(['log row 1'], 1, 1) : detailResponse(failedJob)
      )
    );
    await waitFor(() => expect(screen.getByText(/page 1 of 1/i)).toBeInTheDocument());
  });

  it('shows an error state when the detail request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    render(<JobDetail queue={makeQueue()} jobId="f1" pollingInterval={0} onBack={() => {}} />);

    expect(await screen.findByText(/failed to load job/i)).toBeInTheDocument();
  });

  it('goes back to the jobs list', async () => {
    stubDetailApi(failedJob);
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<JobDetail queue={makeQueue()} jobId="f1" pollingInterval={0} onBack={onBack} />);

    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppJob } from '../api/contract';
import { makeJob, makeQueue } from '../testUtils/fixtures';
import { QueueJobs } from './QueueJobs';

function jobsResponse(jobs: AppJob[], pageCount = 1) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ jobs, pagination: { pageCount, range: { start: 0, end: 99 } } }),
  };
}

function stubJobsApi(jobs: AppJob[], pageCount = 1) {
  const fetchMock = vi.fn().mockResolvedValue(jobsResponse(jobs, pageCount));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function renderQueueJobs(overrides: { onSelectJob?: (job: AppJob) => void } = {}) {
  return render(
    <QueueJobs
      queue={makeQueue()}
      pollingInterval={0}
      onBack={() => {}}
      onSelectJob={overrides.onSelectJob ?? (() => {})}
    />
  );
}

describe('QueueJobs', () => {
  it('offers the six state tabs with their counts', async () => {
    stubJobsApi([]);
    renderQueueJobs();

    const states = screen.getByRole('group', { name: 'Job states' });
    for (const state of ['waiting', 'active', 'completed', 'failed', 'delayed', 'paused']) {
      const tab = within(states).getByRole('button', { name: new RegExp(state) });
      expect(tab).toHaveAttribute('aria-pressed', state === 'waiting' ? 'true' : 'false');
    }
    expect(within(states).getByText('5')).toBeInTheDocument();
    expect(within(states).getByText('3')).toBeInTheDocument();
  });

  it('shows the waiting count on the paused tab while the queue is paused', async () => {
    stubJobsApi([]);
    render(<QueueJobs queue={makeQueue({ isPaused: true })} pollingInterval={0} onBack={() => {}} onSelectJob={() => {}} />);

    const pausedTab = screen.getByRole('button', { name: /paused/ });
    expect(within(pausedTab).getByText('5')).toBeInTheDocument();
  });

  it('lists jobs in a table with id, name, state, progress and attempts columns', async () => {
    stubJobsApi([
      makeJob(0, { id: 'a1', name: 'welcome-email', state: 'waiting', progress: 42, attempts: 2 }),
    ]);
    renderQueueJobs();

    const table = await screen.findByRole('table');
    const headers = within(table).getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers).toEqual(['ID', 'Name', 'State', 'Progress', 'Attempts', 'Actions']);

    await waitFor(() => expect(within(table).getByText('a1')).toBeInTheDocument());
    expect(within(table).getByText('welcome-email')).toBeInTheDocument();
    expect(within(table).getByText('waiting')).toBeInTheDocument();
    expect(within(table).getByText('42%')).toBeInTheDocument();
    expect(within(table).getByText('2')).toBeInTheDocument();
  });

  it('opens the detail of a job from its row', async () => {
    const selected: AppJob = makeJob(0, { id: 'a1', name: 'welcome-email', state: 'failed' });
    stubJobsApi([selected]);
    const onSelectJob = vi.fn();
    const user = userEvent.setup();
    renderQueueJobs({ onSelectJob });

    await user.click(await screen.findByText('welcome-email'));
    expect(onSelectJob).toHaveBeenCalledWith(selected);
  });

  it('switches states through the tabs and resets to the first page', async () => {
    const fetchMock = stubJobsApi([makeJob(0, { state: 'waiting' })]);
    const user = userEvent.setup();
    renderQueueJobs();

    await user.click(screen.getByRole('button', { name: /failed/ }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith('api/queues/emails/jobs?status=failed&page=1&jobsPerPage=100')
    );
  });

  it('pages through the states with next and previous', async () => {
    const fetchMock = stubJobsApi([makeJob(0)], 3);
    const user = userEvent.setup();
    renderQueueJobs();

    await screen.findByRole('table');
    const prev = screen.getByRole('button', { name: 'Previous page' });
    const next = screen.getByRole('button', { name: 'Next page' });
    expect(prev).toBeDisabled();
    expect(screen.getByText(/page 1 of 3/i)).toBeInTheDocument();

    await user.click(next);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith('api/queues/emails/jobs?status=waiting&page=2&jobsPerPage=100')
    );
    expect(screen.getByText(/page 2 of 3/i)).toBeInTheDocument();
    expect(prev).toBeEnabled();
  });

  it('keeps the rendered rows bounded on long pages', async () => {
    const jobs = Array.from({ length: 200 }, (_, index) => makeJob(index));
    stubJobsApi(jobs);
    renderQueueJobs();

    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getByText('job-0')).toBeInTheDocument());

    const rows = within(table).getAllByRole('row');
    expect(rows.length).toBeLessThan(50);
    expect(within(table).queryByText('job-150')).not.toBeInTheDocument();
  });

  it('shows an empty state and hides the pager when a state has no jobs', async () => {
    stubJobsApi([], 0);
    renderQueueJobs();

    expect(await screen.findByText(/no jobs/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument();
  });

  it('falls back to the last page when the queue shrinks under the current page', async () => {
    const fetchMock = stubJobsApi([makeJob(0)], 3);
    const user = userEvent.setup();
    render(<QueueJobs queue={makeQueue()} pollingInterval={50} onBack={() => {}} onSelectJob={() => {}} />);

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(screen.getByText(/page 3 of 3/i)).toBeInTheDocument());

    fetchMock.mockResolvedValue(jobsResponse([makeJob(0)], 1));
    await waitFor(() => expect(screen.getByText(/page 1 of 1/i)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenLastCalledWith('api/queues/emails/jobs?status=waiting&page=1&jobsPerPage=100');
  });

  it('goes back to the queues list', async () => {
    stubJobsApi([]);
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<QueueJobs queue={makeQueue()} pollingInterval={0} onBack={onBack} onSelectJob={() => {}} />);

    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('QueueJobs actions', () => {
  const putUrls = (fetchMock: ReturnType<typeof vi.fn>): string[] =>
    fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'PUT')
      .map(([url]) => String(url));

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('offers pause and empty in the header of a writable queue', async () => {
    stubJobsApi([]);
    renderQueueJobs();

    const actions = screen.getByRole('group', { name: 'Queue actions' });
    expect(within(actions).getByRole('button', { name: 'Pause queue' })).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: 'Empty queue' })).toBeInTheDocument();
  });

  it('pauses and resumes the queue from the header', async () => {
    const fetchMock = stubJobsApi([]);
    const user = userEvent.setup();
    renderQueueJobs();

    await user.click(screen.getByRole('button', { name: 'Pause queue' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('api/queues/emails/pause', { method: 'PUT' })
    );
    expect(await screen.findByRole('button', { name: 'Resume queue' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Resume queue' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('api/queues/emails/resume', { method: 'PUT' })
    );
    expect(await screen.findByRole('button', { name: 'Pause queue' })).toBeInTheDocument();
  });

  it('empties the queue after confirmation', async () => {
    const fetchMock = stubJobsApi([]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderQueueJobs();

    await user.click(screen.getByRole('button', { name: 'Empty queue' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('api/queues/emails/empty', { method: 'PUT' })
    );
  });

  it('skips destructive actions when the confirmation is declined', async () => {
    const fetchMock = stubJobsApi([]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderQueueJobs();

    await user.click(screen.getByRole('button', { name: 'Empty queue' }));
    expect(fetchMock).not.toHaveBeenCalledWith('api/queues/emails/empty', expect.anything());
  });

  it('shows retry on failed rows, promote on delayed rows, remove on every row', async () => {
    stubJobsApi([
      makeJob(0, { id: 'a1', name: 'welcome-email', state: 'failed' }),
      makeJob(1, { id: 'a2', name: 'later-email', state: 'delayed' }),
      makeJob(2, { id: 'a3', name: 'wait-email', state: 'waiting' }),
    ]);
    renderQueueJobs();
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getByText('welcome-email')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Retry job a1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Promote job a2' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Promote job a1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry job a3' })).not.toBeInTheDocument();
    for (const id of ['a1', 'a2', 'a3']) {
      expect(screen.getByRole('button', { name: `Remove job ${id}` })).toBeInTheDocument();
    }
  });

  it('retries a failed job from its row without opening the detail', async () => {
    const fetchMock = stubJobsApi([makeJob(0, { id: 'a1', name: 'welcome-email', state: 'failed' })]);
    const onSelectJob = vi.fn();
    const user = userEvent.setup();
    renderQueueJobs({ onSelectJob });

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Retry job a1' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('api/queues/emails/a1/retry', { method: 'PUT' })
    );
    expect(onSelectJob).not.toHaveBeenCalled();
  });

  it('promotes a delayed job from its row', async () => {
    const fetchMock = stubJobsApi([makeJob(0, { id: 'a1', name: 'later-email', state: 'delayed' })]);
    const user = userEvent.setup();
    renderQueueJobs();

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Promote job a1' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('api/queues/emails/a1/promote', { method: 'PUT' })
    );
  });

  it('removes a job from its row', async () => {
    const fetchMock = stubJobsApi([makeJob(0, { id: 'a1', name: 'wait-email', state: 'waiting' })]);
    const user = userEvent.setup();
    renderQueueJobs();

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Remove job a1' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('api/queues/emails/a1/remove', { method: 'PUT' })
    );
  });

  it('retries all failed jobs from the failed tab', async () => {
    const fetchMock = stubJobsApi([]);
    const user = userEvent.setup();
    renderQueueJobs();

    await user.click(screen.getByRole('button', { name: /failed/ }));
    await user.click(screen.getByRole('button', { name: 'Retry all failed' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('api/queues/emails/retry/failed', { method: 'PUT' })
    );
  });

  it('promotes all delayed jobs from the delayed tab', async () => {
    const fetchMock = stubJobsApi([]);
    const user = userEvent.setup();
    renderQueueJobs();

    await user.click(screen.getByRole('button', { name: /delayed/ }));
    await user.click(screen.getByRole('button', { name: 'Promote all delayed' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('api/queues/emails/promote', { method: 'PUT' })
    );
  });

  it('cleans the completed jobs from the completed tab after confirmation', async () => {
    const fetchMock = stubJobsApi([]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderQueueJobs();

    await user.click(screen.getByRole('button', { name: /completed/ }));
    await user.click(screen.getByRole('button', { name: 'Clean completed' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('api/queues/emails/clean/completed?grace=5', {
        method: 'PUT',
      })
    );
  });

  it('cleans the failed jobs from the failed tab after confirmation', async () => {
    const fetchMock = stubJobsApi([]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderQueueJobs();

    await user.click(screen.getByRole('button', { name: /failed/ }));
    await user.click(screen.getByRole('button', { name: 'Clean failed' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('api/queues/emails/clean/failed?grace=5', {
        method: 'PUT',
      })
    );
  });

  it('offers no row actions on active rows', async () => {
    stubJobsApi([makeJob(0, { id: 'a1', name: 'running-email', state: 'active' })]);
    renderQueueJobs();

    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getByText('running-email')).toBeInTheDocument());

    expect(screen.queryByRole('button', { name: 'Remove job a1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry job a1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Promote job a1' })).not.toBeInTheDocument();
  });

  it('removes all jobs in the active state after confirmation', async () => {
    const fetchMock = stubJobsApi([]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderQueueJobs();

    await user.click(screen.getByRole('button', { name: /failed/ }));
    await user.click(screen.getByRole('button', { name: 'Remove all failed' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('api/queues/emails/remove/failed', { method: 'PUT' })
    );
  });

  it('refreshes the jobs list after an action', async () => {
    const fetchMock = stubJobsApi([makeJob(0, { id: 'a1', state: 'failed' })]);
    const user = userEvent.setup();
    renderQueueJobs();

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Retry job a1' }));
    await waitFor(() =>
      expect(putUrls(fetchMock)).toContain('api/queues/emails/a1/retry')
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        'api/queues/emails/jobs?status=waiting&page=1&jobsPerPage=100'
      )
    );
  });

  it('hides every action control while the queue is read-only', async () => {
    stubJobsApi([makeJob(0, { id: 'a1', state: 'failed' })]);
    render(<QueueJobs queue={makeQueue({ readOnlyMode: true })} pollingInterval={0} onBack={() => {}} onSelectJob={() => {}} />);

    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getByText('a1')).toBeInTheDocument());

    expect(screen.queryByRole('group', { name: 'Queue actions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry job a1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove job a1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry all failed' })).not.toBeInTheDocument();
    const headers = within(table).getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers).not.toContain('Actions');
  });

  it('hides the retry controls when the queue disallows retries', async () => {
    stubJobsApi([makeJob(0, { id: 'a1', state: 'failed' })]);
    const user = userEvent.setup();
    render(
      <QueueJobs
        queue={makeQueue({ allowRetries: false })}
        pollingInterval={0}
        onBack={() => {}}
        onSelectJob={() => {}}
      />
    );

    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getByText('a1')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /failed/ }));

    expect(screen.queryByRole('button', { name: 'Retry job a1' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove job a1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry all failed' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove all failed' })).toBeInTheDocument();
  });

  it('shows an error when an action fails', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) =>
      init?.method === 'PUT'
        ? Promise.resolve({ ok: false, status: 403, json: async () => ({}) })
        : Promise.resolve(jobsResponse([makeJob(0, { id: 'a1', state: 'failed' })]))
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderQueueJobs();

    await screen.findByRole('table');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry job a1' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Retry job a1' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Action failed');
  });
});

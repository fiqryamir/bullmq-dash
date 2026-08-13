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
    expect(headers).toEqual(['ID', 'Name', 'State', 'Progress', 'Attempts']);

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

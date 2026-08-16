import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppJobScheduler } from '../api/contract';
import { makeQueue } from '../testUtils/fixtures';
import { QueueSchedulers } from './QueueSchedulers';

function scheduler(overrides: Partial<AppJobScheduler> = {}): AppJobScheduler {
  return {
    id: 'nightly',
    name: 'nightly-digest',
    every: 86_400_000,
    iterationCount: 3,
    ...overrides,
  };
}

function schedulersResponse(schedulers: AppJobScheduler[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ schedulers }),
  };
}

function stubSchedulersApi(schedulers: AppJobScheduler[]) {
  const fetchMock = vi.fn().mockResolvedValue(schedulersResponse(schedulers));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderSchedulers(queue = makeQueue()) {
  return render(
    <QueueSchedulers queue={queue} onBack={() => {}} onSelectView={() => {}} showMetrics />
  );
}

describe('QueueSchedulers', () => {
  it('lists the schedulers with their schedule, next run and runs', async () => {
    stubSchedulersApi([
      scheduler({
        next: 1700000000000,
        lastRun: 1699913600000,
        iterationCount: 3,
        limit: 10,
      }),
    ]);
    renderSchedulers();

    const table = await screen.findByRole('table');
    expect(within(table).getByText('nightly')).toBeInTheDocument();
    expect(within(table).getByText('nightly-digest')).toBeInTheDocument();
    expect(within(table).getByText('every 1d')).toBeInTheDocument();
    expect(within(table).getByText('3')).toBeInTheDocument();
    expect(within(table).getByText('of 10')).toBeInTheDocument();
  });

  it('shows the cron pattern for pattern schedulers', async () => {
    stubSchedulersApi([scheduler({ pattern: '0 3 * * *', tz: 'UTC' })]);
    renderSchedulers();

    const table = await screen.findByRole('table');
    expect(within(table).getByText('0 3 * * *')).toBeInTheDocument();
    expect(within(table).getByText('UTC')).toBeInTheDocument();
  });

  it('shows an empty state when nothing is scheduled', async () => {
    stubSchedulersApi([]);
    renderSchedulers();

    expect(await screen.findByText('No repeatable jobs scheduled')).toBeInTheDocument();
  });

  it('adds a scheduler through the form', async () => {
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({ scheduler: scheduler({ id: 'created' }) }),
        });
      }
      return Promise.resolve(schedulersResponse([scheduler()]));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderSchedulers();
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'Add scheduler' }));
    const form = screen.getByRole('form', { name: 'Scheduler form' });
    await user.type(within(form).getByLabelText('Scheduler id'), 'created');
    await user.selectOptions(within(form).getByLabelText('Schedule kind'), 'every');
    await user.type(within(form).getByLabelText('Interval in milliseconds'), '60000');
    await user.type(within(form).getByLabelText('Job name'), 'heartbeat');
    await user.type(within(form).getByLabelText('Job data'), '{{"beat":true}');
    await user.click(within(form).getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST');
      expect(post).toBeDefined();
      expect(post![0]).toBe('api/queues/emails/job-schedulers');
      expect(JSON.parse(post![1]!.body as string)).toEqual({
        id: 'created',
        repeat: { every: 60000 },
        jobTemplate: { name: 'heartbeat', data: { beat: true } },
      });
    });
  });

  it('rejects invalid job data JSON without calling the API', async () => {
    stubSchedulersApi([]);
    const user = userEvent.setup();

    renderSchedulers();
    await screen.findByText('No repeatable jobs scheduled');

    await user.click(screen.getByRole('button', { name: 'Add scheduler' }));
    const form = screen.getByRole('form', { name: 'Scheduler form' });
    await user.type(within(form).getByLabelText('Scheduler id'), 'created');
    await user.selectOptions(within(form).getByLabelText('Schedule kind'), 'every');
    await user.type(within(form).getByLabelText('Interval in milliseconds'), '60000');
    await user.type(within(form).getByLabelText('Job data'), '{{not json');
    await user.click(within(form).getByRole('button', { name: 'Add' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Job data must be valid JSON');
  });

  it('edits a scheduler through the form', async () => {
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (options?.method === 'PATCH') {
        return Promise.resolve({ ok: true, status: 204, json: async () => ({}) });
      }
      return Promise.resolve(schedulersResponse([scheduler()]));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderSchedulers();
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'Edit scheduler nightly' }));
    const form = screen.getByRole('form', { name: 'Scheduler form' });
    await user.clear(within(form).getByLabelText('Interval in milliseconds'));
    await user.type(within(form).getByLabelText('Interval in milliseconds'), '120000');
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
      expect(patch).toBeDefined();
      expect(patch![0]).toBe('api/queues/emails/job-schedulers/nightly');
      expect(JSON.parse(patch![1]!.body as string)).toEqual({ every: 120000 });
    });
  });

  it('removes a scheduler after confirmation', async () => {
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (options?.method === 'PUT') {
        return Promise.resolve({ ok: true, status: 204, json: async () => ({}) });
      }
      return Promise.resolve(schedulersResponse([scheduler()]));
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    renderSchedulers();
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'Remove scheduler nightly' }));

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(([, options]) => options?.method === 'PUT');
      expect(put).toBeDefined();
      expect(put![0]).toBe('api/queues/emails/job-schedulers/nightly/remove');
    });
  });

  it('hides the mutation controls on a read-only queue', async () => {
    stubSchedulersApi([scheduler()]);
    renderSchedulers(makeQueue({ readOnlyMode: true }));

    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: 'Add scheduler' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit scheduler nightly' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove scheduler nightly' })).not.toBeInTheDocument();
  });

  it('reports a load failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    renderSchedulers();

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load schedulers');
  });
});

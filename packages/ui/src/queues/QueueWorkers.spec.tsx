import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeQueue } from '../testUtils/fixtures';
import { QueueWorkers } from './QueueWorkers';

function workersResponse(workers: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ workers }),
  };
}

function stubWorkersApi(workers: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(workersResponse(workers));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderWorkers(queue = makeQueue()) {
  return render(<QueueWorkers queue={queue} onBack={() => {}} onSelectView={() => {}} showMetrics />);
}

describe('QueueWorkers', () => {
  it('lists the connected workers with name, address and age', async () => {
    stubWorkersApi([
      { id: '1', name: 'mailer', addr: '127.0.0.1:55432', age: 95 },
      { id: '2', name: null, addr: '127.0.0.1:55433', age: 3600 },
    ]);
    renderWorkers();

    const table = await screen.findByRole('table');
    expect(within(table).getByText('mailer')).toBeInTheDocument();
    expect(within(table).getByText('127.0.0.1:55432')).toBeInTheDocument();
    expect(within(table).getByText('2m')).toBeInTheDocument();
    expect(within(table).getByText('unnamed')).toBeInTheDocument();
    expect(within(table).getByText('1h')).toBeInTheDocument();
  });

  it('distinguishes nobody connected from could-not-ask', async () => {
    stubWorkersApi([]);
    renderWorkers();

    expect(await screen.findByText('No workers connected')).toBeInTheDocument();
  });

  it('reports queues that cannot answer', async () => {
    stubWorkersApi(null);
    renderWorkers();

    expect(await screen.findByText('This queue cannot report its workers')).toBeInTheDocument();
  });

  it('refetches on demand through the refresh button', async () => {
    const fetchMock = stubWorkersApi([]);
    const user = userEvent.setup();
    renderWorkers();

    await screen.findByText('No workers connected');
    await user.click(screen.getByRole('button', { name: 'Refresh workers' }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('reports a load failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    renderWorkers();

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load workers');
  });
});

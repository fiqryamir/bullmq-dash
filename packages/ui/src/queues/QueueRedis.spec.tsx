import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RedisStats } from '../api/contract';
import { makeQueue } from '../testUtils/fixtures';
import { QueueRedis } from './QueueRedis';

function statsResponse(stats: RedisStats | undefined) {
  return {
    ok: true,
    status: 200,
    json: async () => stats,
  };
}

function stubRedisApi(stats: RedisStats | undefined) {
  const fetchMock = vi.fn().mockResolvedValue(statsResponse(stats));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const stats: RedisStats = {
  backend: 'redis',
  version: '7.2.5',
  mode: 'standalone',
  port: 6379,
  os: 'Linux',
  uptime: 172_900,
  memory: {
    total: 1_073_741_824,
    used: 268_435_456,
    fragmentationRatio: 1.05,
    peak: 536_870_912,
  },
  clients: {
    connected: 4,
    blocked: 0,
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderRedis(queue = makeQueue()) {
  return render(<QueueRedis queue={queue} onBack={() => {}} onSelectView={() => {}} showMetrics />);
}

describe('QueueRedis', () => {
  it('reports version, memory and clients', async () => {
    stubRedisApi(stats);
    renderRedis();

    const panel = await waitForPanel();
    expect(within(panel).getByText('7.2.5')).toBeInTheDocument();
    expect(within(panel).getByText('256.0 MB')).toBeInTheDocument();
    expect(within(panel).getByText('1.0 GB')).toBeInTheDocument();
    expect(within(panel).getByText('512.0 MB')).toBeInTheDocument();
    expect(within(panel).getByText('1.05')).toBeInTheDocument();
    expect(within(panel).getByText('4')).toBeInTheDocument();
    expect(within(panel).getByText('2d 0h')).toBeInTheDocument();
  });

  it('shows the unavailable state for an empty answer', async () => {
    stubRedisApi(undefined);
    renderRedis();

    expect(await screen.findByText('Redis stats unavailable')).toBeInTheDocument();
  });

  it('refetches on demand through the refresh button', async () => {
    const fetchMock = stubRedisApi(stats);
    const user = userEvent.setup();
    renderRedis();

    await waitForPanel();
    await user.click(screen.getByRole('button', { name: 'Refresh Redis stats' }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('reports a load failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    renderRedis();

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load Redis stats');
  });
});

async function waitForPanel(): Promise<HTMLElement> {
  return await screen.findByLabelText('Redis stats of the backing store');
}

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppJob, FlowNode, JobFlow } from '../api/contract';
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

function flowResponse(flow: JobFlow) {
  return {
    ok: true,
    status: 200,
    json: async () => flow,
  };
}

function stubDetailApi(
  job: Partial<AppJob>,
  logs: string[] = [],
  pageCount = 1,
  count = logs.length,
  status = 'failed',
  flow?: JobFlow
) {
  const fetchMock = vi.fn((url: string): Promise<FetchResponse> => {
    if (String(url).includes('/logs')) {
      return Promise.resolve(logsResponse(logs, pageCount, count));
    }
    if (String(url).endsWith('/flow')) {
      return Promise.resolve(flowResponse(flow ?? { nodeId: 'f1', isFlowNode: false, flowRoot: null }));
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
    render(<JobDetail queue={makeQueue()} jobId="f1" pollingInterval={0} onBack={() => {}} onSelectNode={() => {}} />);

    expect(await screen.findByText('failed')).toBeInTheDocument();
    expect(screen.getByText('#f1')).toBeInTheDocument();
    expect(screen.getByText('welcome-email')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(new Date(1700000000000).toISOString())).toBeInTheDocument();
  });

  it('renders the job data and options as JSON', async () => {
    stubDetailApi(failedJob);
    render(<JobDetail queue={makeQueue()} jobId="f1" pollingInterval={0} onBack={() => {}} onSelectNode={() => {}} />);

    await screen.findByText('failed');
    const data = screen.getByRole('region', { name: 'Job data' });
    expect(within(data).getByText(/a@example\.com/)).toBeInTheDocument();

    const options = screen.getByRole('region', { name: 'Job options' });
    expect(within(options).getByText(/"priority": 3/)).toBeInTheDocument();
  });

  it('renders the failed reason and the stacktrace of a failed job', async () => {
    stubDetailApi(failedJob);
    render(<JobDetail queue={makeQueue()} jobId="f1" pollingInterval={0} onBack={() => {}} onSelectNode={() => {}} />);

    await screen.findByText('failed');
    const reason = screen.getByRole('region', { name: 'Failed reason' });
    expect(within(reason).getByText('kaboom')).toBeInTheDocument();

    const stacktrace = screen.getByRole('region', { name: 'Stacktrace' });
    expect(within(stacktrace).getByText(/Error: kaboom/)).toBeInTheDocument();
  });

  it('fetches the detail and the first logs page on mount', async () => {
    const fetchMock = stubDetailApi(failedJob, ['log row']);
    render(<JobDetail queue={makeQueue()} jobId="f1" pollingInterval={0} onBack={() => {}} onSelectNode={() => {}} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('api/queues/emails/f1');
      expect(fetchMock).toHaveBeenCalledWith('api/queues/emails/f1/logs?page=1&logsPerPage=100');
    });
  });

  it('lists the log rows newest first', async () => {
    stubDetailApi(failedJob, ['log row 2', 'log row 1'], 1, 2);
    render(<JobDetail queue={makeQueue()} jobId="f1" pollingInterval={0} onBack={() => {}} onSelectNode={() => {}} />);

    await screen.findByText('failed');
    const logs = screen.getByRole('region', { name: 'Logs' });
    const rows = await within(logs).findAllByText(/log row/);
    expect(rows.map((row) => row.textContent)).toEqual(['log row 2', 'log row 1']);
  });

  it('pages through the logs', async () => {
    const fetchMock = stubDetailApi(failedJob, ['log row 5', 'log row 4'], 3, 5);
    const user = userEvent.setup();
    render(<JobDetail queue={makeQueue()} jobId="f1" pollingInterval={0} onBack={() => {}} onSelectNode={() => {}} />);

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
    render(<JobDetail queue={makeQueue()} jobId="f1" pollingInterval={50} onBack={() => {}} onSelectNode={() => {}} />);

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
    render(<JobDetail queue={makeQueue()} jobId="f1" pollingInterval={0} onBack={() => {}} onSelectNode={() => {}} />);

    expect(await screen.findByText(/failed to load job/i)).toBeInTheDocument();
  });

  it('goes back to the jobs list', async () => {
    stubDetailApi(failedJob);
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<JobDetail queue={makeQueue()} jobId="f1" pollingInterval={0} onBack={onBack} onSelectNode={() => {}} />);

    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  describe('flow section', () => {
    const flowTree: FlowNode = {
      id: 'r1',
      name: 'root-job',
      state: 'waiting-children',
      progress: 0,
      queueName: 'emails',
      children: [
        { id: 'c1', name: 'child-job', state: 'waiting', progress: 0, queueName: 'emails', children: [] },
      ],
    };

    it('fetches the flow tree on mount', async () => {
      const fetchMock = stubDetailApi(failedJob, [], 1, 0, 'failed', {
        nodeId: 'f1',
        isFlowNode: true,
        flowRoot: flowTree,
      });
      render(<JobDetail queue={makeQueue()} jobId="f1" pollingInterval={0} onBack={() => {}} onSelectNode={() => {}} />);

      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('api/queues/emails/f1/flow'));
    });

    it('renders the flow tree of a flow node', async () => {
      stubDetailApi(failedJob, [], 1, 0, 'failed', {
        nodeId: 'f1',
        isFlowNode: true,
        flowRoot: flowTree,
      });
      render(<JobDetail queue={makeQueue()} jobId="f1" pollingInterval={0} onBack={() => {}} onSelectNode={() => {}} />);

      const flow = await screen.findByRole('region', { name: 'Flow' });
      expect(await within(flow).findByText('root-job')).toBeInTheDocument();
      expect(within(flow).getByText('child-job')).toBeInTheDocument();
    });

    it('says a plain job is not part of a flow', async () => {
      stubDetailApi(failedJob, [], 1, 0, 'failed', {
        nodeId: 'f1',
        isFlowNode: false,
        flowRoot: null,
      });
      render(<JobDetail queue={makeQueue()} jobId="f1" pollingInterval={0} onBack={() => {}} onSelectNode={() => {}} />);

      expect(await screen.findByText(/not part of a flow/i)).toBeInTheDocument();
    });

    it('opens the selected node through onSelectNode', async () => {
      stubDetailApi(failedJob, [], 1, 0, 'failed', {
        nodeId: 'f1',
        isFlowNode: true,
        flowRoot: flowTree,
      });
      const onSelectNode = vi.fn();
      render(<JobDetail queue={makeQueue()} jobId="f1" pollingInterval={0} onBack={() => {}} onSelectNode={onSelectNode} />);

      const node = await screen.findByText('child-job');
      fireEvent.click(node);
      expect(onSelectNode).toHaveBeenCalledWith(flowTree.children[0]);
    });

    it('shows an error state when the flow request fails', async () => {
      stubDetailApi(failedJob);
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) =>
          Promise.resolve(
            String(url).endsWith('/flow')
              ? { ok: false, status: 500, json: async () => ({}) }
              : String(url).includes('/logs')
                ? logsResponse([])
                : detailResponse(failedJob)
          )
        )
      );
      render(<JobDetail queue={makeQueue()} jobId="f1" pollingInterval={0} onBack={() => {}} onSelectNode={() => {}} />);

      expect(await screen.findByText(/failed to load flow/i)).toBeInTheDocument();
    });
  });
});

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FlowNode, QueueFlowResponse } from '../api/contract';
import { makeQueue } from '../testUtils/fixtures';
import { THEME_STORAGE_KEY } from '../theme/constants';
import { ThemeProvider } from '../theme/ThemeProvider';
import { QueueFlow } from './QueueFlow';

function flowResponse(flow: QueueFlowResponse) {
  return {
    ok: true,
    status: 200,
    json: async () => flow,
  };
}

function stubFlowApi(flow: QueueFlowResponse) {
  const fetchMock = vi.fn().mockResolvedValue(flowResponse(flow));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const flowTree: FlowNode = {
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
      children: [
        { id: 'g1', name: 'grand-job', state: 'completed', progress: 100, queueName: 'emails', children: [] },
      ],
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function renderQueueFlow(
  overrides: { onSelectNode?: (node: FlowNode) => void } = {},
  theme: 'dark' | 'light' = 'dark'
) {
  if (theme === 'light') {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
  } else {
    localStorage.removeItem(THEME_STORAGE_KEY);
  }

  return render(
    <ThemeProvider>
      <QueueFlow
        queue={makeQueue()}
        pollingInterval={0}
        onBack={() => {}}
        onSelectView={() => {}}
        showMetrics
        onSelectNode={overrides.onSelectNode ?? (() => {})}
      />
    </ThemeProvider>
  );
}

describe('QueueFlow', () => {
  it('fetches the queue flow on mount', async () => {
    const fetchMock = stubFlowApi({ roots: [flowTree], nodeCount: 3, truncated: false });
    renderQueueFlow();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('api/queues/emails/flow'));
  });

  it('renders every job of the graph as a state-colored node', async () => {
    stubFlowApi({ roots: [flowTree], nodeCount: 3, truncated: false });
    renderQueueFlow();

    const graph = await screen.findByTestId('flow-graph');
    expect(await within(graph).findByText('root-job')).toBeInTheDocument();
    expect(within(graph).getByText('child-job')).toBeInTheDocument();
    expect(within(graph).getByText('grand-job')).toBeInTheDocument();
    expect(within(graph).getByText('#r1')).toBeInTheDocument();
    expect(within(graph).getByText('Waiting Children')).toBeInTheDocument();
    expect(graph.querySelector('.flow-node--waiting-children.flow-node--delayed')).toBeInTheDocument();
    expect(graph.querySelector('.flow-node--waiting-children .dash-chip--delayed')).toBeInTheDocument();
  });

  it('keeps all canonical state modifiers and alias meanings on flow nodes', async () => {
    const states = ['waiting', 'active', 'delayed', 'completed', 'failed', 'paused'] as const;
    const roots: FlowNode[] = states.map((state, index) => ({
      id: `state-${index}`,
      name: `${state}-job`,
      state,
      progress: 0,
      queueName: 'emails',
      children: [],
    }));
    roots.push({
      id: 'prioritized',
      name: 'prioritized-job',
      state: 'prioritized',
      progress: 0,
      queueName: 'emails',
      children: [],
    });
    roots.push({
      id: 'unknown',
      name: 'unknown-job',
      state: 'unknown',
      progress: 0,
      queueName: 'emails',
      children: [],
    });
    stubFlowApi({ roots, nodeCount: roots.length, truncated: false });
    renderQueueFlow();

    const graph = await screen.findByTestId('flow-graph');
    for (const state of states) {
      expect(graph.querySelector(`.flow-node--${state}`)).toBeInTheDocument();
    }
    expect(graph.querySelector('.flow-node--prioritized.flow-node--active')).toBeInTheDocument();
    expect(graph.querySelector('.flow-node--prioritized .dash-chip--active')).toHaveTextContent('Prioritized');
    expect(graph.querySelector('.flow-node--unknown .dash-chip')).toHaveClass('dash-chip');
    expect(graph.querySelector('.chip')).toBeNull();
  });

  it('shows the truncated notice when the graph is capped', async () => {
    stubFlowApi({ roots: [flowTree], nodeCount: 200, truncated: true });
    renderQueueFlow();

    expect(await screen.findByText(/graph truncated — showing the first 200 nodes/i)).toBeInTheDocument();
  });

  it('does not show the truncated notice for a full graph', async () => {
    stubFlowApi({ roots: [flowTree], nodeCount: 3, truncated: false });
    renderQueueFlow();

    await screen.findByText('root-job');
    expect(screen.queryByText(/graph truncated/i)).not.toBeInTheDocument();
  });

  it('passes the dashboard theme to react-flow', async () => {
    stubFlowApi({ roots: [flowTree], nodeCount: 3, truncated: false });
    renderQueueFlow({}, 'light');

    const graph = await screen.findByTestId('flow-graph');
    await waitFor(() => expect(graph.querySelector('.react-flow.light')).toBeTruthy());
  });

  it('shows an empty state when the queue has no live jobs', async () => {
    stubFlowApi({ roots: [], nodeCount: 0, truncated: false });
    renderQueueFlow();

    expect(await screen.findByText('No live jobs')).toBeInTheDocument();
  });

  it('shows an error state when the flow request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    renderQueueFlow();

    expect(await screen.findByText(/failed to load flow/i)).toBeInTheDocument();
  });

  it('opens the selected node through onSelectNode', async () => {
    stubFlowApi({ roots: [flowTree], nodeCount: 3, truncated: false });
    const onSelectNode = vi.fn();
    renderQueueFlow({ onSelectNode });

    const node = await screen.findByText('child-job');
    fireEvent.click(node);
    expect(onSelectNode).toHaveBeenCalledWith(flowTree.children[0]);
  });

  it('opens a focused node through keyboard activation', async () => {
    stubFlowApi({ roots: [flowTree], nodeCount: 3, truncated: false });
    const onSelectNode = vi.fn();
    renderQueueFlow({ onSelectNode });

    const node = await screen.findByTestId('rf__node-emails:c1');
    fireEvent.keyDown(node, { key: 'Enter' });
    expect(onSelectNode).toHaveBeenCalledWith(flowTree.children[0]);
  });
});

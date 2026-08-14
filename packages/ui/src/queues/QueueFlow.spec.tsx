import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FlowNode, QueueFlowResponse } from '../api/contract';
import { makeQueue } from '../testUtils/fixtures';
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

function renderQueueFlow(overrides: { onSelectNode?: (node: FlowNode) => void } = {}) {
  return render(
    <QueueFlow
      queue={makeQueue()}
      pollingInterval={0}
      onBack={() => {}}
      onSelectNode={overrides.onSelectNode ?? (() => {})}
    />
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
    expect(within(graph).getByText('waiting-children')).toBeInTheDocument();
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
});

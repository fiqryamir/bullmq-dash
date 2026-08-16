import type { AppQueue, FlowNode } from '../api/contract';
import { FlowGraph } from './FlowGraph';
import { QueueNav, type QueueViewName } from './QueueNav';
import { useQueueFlow } from './useQueueFlow';

type QueueFlowProps = {
  queue: AppQueue;
  pollingInterval?: number;
  onBack: () => void;
  onSelectView: (view: QueueViewName) => void;
  showMetrics: boolean;
  onSelectNode: (node: FlowNode) => void;
};

export function QueueFlow({
  queue,
  pollingInterval,
  onBack,
  onSelectView,
  showMetrics,
  onSelectNode,
}: QueueFlowProps) {
  const { roots, nodeCount, truncated, status } = useQueueFlow(queue.name, pollingInterval);

  return (
    <section className="queue-flow" aria-label={`Flow of ${queue.name}`}>
      <header className="queue-jobs__header">
        <button type="button" className="queue-jobs__back" onClick={onBack}>
          ← Back
        </button>
        <h1 className="queue-jobs__title">{queue.name}</h1>
        <span className="queue-flow__subtitle">Flow</span>
      </header>

      <QueueNav queue={queue} active="flow" onSelect={onSelectView} showMetrics={showMetrics} />

      {status === 'loading' ? (
        <p className="queues-status">Loading flow…</p>
      ) : status === 'error' ? (
        <p className="queues-status queues-status--error">Failed to load flow</p>
      ) : nodeCount === 0 ? (
        <p className="queues-status">No live jobs</p>
      ) : (
        <>
          {truncated && (
            <p className="queues-status flow-notice" role="status">
              Graph truncated — showing the first {nodeCount} nodes.
            </p>
          )}
          <div className="flow-graph" data-testid="flow-graph">
            <FlowGraph roots={roots} sourceQueueName={queue.name} onSelectNode={onSelectNode} />
          </div>
        </>
      )}
    </section>
  );
}

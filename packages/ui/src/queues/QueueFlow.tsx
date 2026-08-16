import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const { roots, nodeCount, truncated, status } = useQueueFlow(queue.name, pollingInterval);

  return (
    <section className="queue-flow" aria-label={t('FLOW.VIEW_ARIA', { queue: queue.name })}>
      <header className="queue-jobs__header">
        <button type="button" className="queue-jobs__back" onClick={onBack}>
          {t('COMMON.BACK')}
        </button>
        <h1 className="queue-jobs__title">{queue.name}</h1>
        <span className="queue-flow__subtitle">{t('NAV.FLOW')}</span>
      </header>

      <QueueNav queue={queue} active="flow" onSelect={onSelectView} showMetrics={showMetrics} />

      {status === 'loading' ? (
        <p className="queues-status">{t('FLOW.LOADING')}</p>
      ) : status === 'error' ? (
        <p className="queues-status queues-status--error">{t('FLOW.LOAD_FAILED')}</p>
      ) : nodeCount === 0 ? (
        <p className="queues-status">{t('FLOW.NO_LIVE_JOBS')}</p>
      ) : (
        <>
          {truncated && (
            <p className="queues-status flow-notice" role="status">
              {t('FLOW.TRUNCATED', { nodeCount })}
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

import type { AppQueue } from '../api/contract';
import { QueueNav, type QueueViewName } from './QueueNav';
import { formatAge } from './scheduleFormat';
import { useQueueWorkers } from './useQueueWorkers';

type QueueWorkersProps = {
  queue: AppQueue;
  onBack: () => void;
  onSelectView: (view: QueueViewName) => void;
  showMetrics: boolean;
};

export function QueueWorkers({ queue, onBack, onSelectView, showMetrics }: QueueWorkersProps) {
  const { workers, status, refresh } = useQueueWorkers(queue.name);

  return (
    <section className="queue-workers" aria-label={`Workers of ${queue.name}`}>
      <header className="queue-jobs__header">
        <button
          type="button"
          className="queue-jobs__back"
          onClick={onBack}
          aria-label="Back to jobs"
        >
          ← Back
        </button>
        <h1 className="queue-jobs__title">{queue.name}</h1>
        <span className="queue-flow__subtitle">Workers</span>
        <button
          type="button"
          className="action-btn queue-jobs__view-action"
          onClick={refresh}
          aria-label="Refresh workers"
        >
          Refresh
        </button>
      </header>

      <QueueNav queue={queue} active="workers" onSelect={onSelectView} showMetrics={showMetrics} />

      {status === 'loading' ? (
        <p className="queues-status">Loading workers…</p>
      ) : status === 'error' ? (
        <p className="queues-status queues-status--error" role="alert">
          Failed to load workers
        </p>
      ) : workers === null ? (
        <p className="queues-status">This queue cannot report its workers</p>
      ) : workers.length === 0 ? (
        <p className="queues-status">No workers connected</p>
      ) : (
        <div className="queue-workers__table-wrap">
          <table className="job-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Address</th>
                <th scope="col">Connected for</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((worker) => (
                <tr key={worker.id}>
                  <td>{worker.name ?? <span className="queue-workers__unnamed">unnamed</span>}</td>
                  <td>
                    <span className="job-cell__id">{worker.addr}</span>
                  </td>
                  <td>{formatAge(worker.age)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

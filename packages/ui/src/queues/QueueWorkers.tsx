import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const { workers, status, refresh } = useQueueWorkers(queue.name);

  return (
    <section className="queue-workers" aria-label={t('WORKERS.VIEW_ARIA', { queue: queue.name })}>
      <header className="queue-jobs__header">
        <button
          type="button"
          className="queue-jobs__back"
          onClick={onBack}
          aria-label={t('COMMON.BACK_TO_JOBS')}
        >
          {t('COMMON.BACK')}
        </button>
        <h1 className="queue-jobs__title">{queue.name}</h1>
        <span className="queue-flow__subtitle">{t('WORKERS.TITLE')}</span>
        <button
          type="button"
          className="action-btn queue-jobs__view-action"
          onClick={refresh}
          aria-label={t('WORKERS.REFRESH_ARIA')}
        >
          {t('COMMON.REFRESH')}
        </button>
      </header>

      <QueueNav queue={queue} active="workers" onSelect={onSelectView} showMetrics={showMetrics} />

      {status === 'loading' ? (
        <p className="queues-status">{t('WORKERS.LOADING')}</p>
      ) : status === 'error' ? (
        <p className="queues-status queues-status--error" role="alert">
          {t('WORKERS.LOAD_FAILED')}
        </p>
      ) : workers === null ? (
        <p className="queues-status">{t('WORKERS.CANT_REPORT')}</p>
      ) : workers.length === 0 ? (
        <p className="queues-status">{t('WORKERS.NO_WORKERS')}</p>
      ) : (
        <div className="queue-workers__table-wrap">
          <table className="job-table">
            <thead>
              <tr>
                <th scope="col">{t('QUEUE.INFO.NAME')}</th>
                <th scope="col">{t('WORKERS.ADDRESS')}</th>
                <th scope="col">{t('WORKERS.CONNECTED_FOR')}</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((worker) => (
                <tr key={worker.id}>
                  <td>
                    {worker.name ?? <span className="queue-workers__unnamed">{t('WORKERS.UNNAMED')}</span>}
                  </td>
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

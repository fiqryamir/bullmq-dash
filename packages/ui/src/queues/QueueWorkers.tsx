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
          className="dash-button dash-button--ghost dash-focus-ring"
          onClick={onBack}
          aria-label={t('COMMON.BACK_TO_JOBS')}
        >
          {t('COMMON.BACK')}
        </button>
        <h1 className="dash-view-title">{queue.name}</h1>
        <span className="dash-view-subtitle">{t('WORKERS.TITLE')}</span>
        <button
          type="button"
          className="dash-button dash-button--ghost dash-focus-ring queue-jobs__view-action"
          onClick={refresh}
          aria-label={t('WORKERS.REFRESH_ARIA')}
        >
          {t('COMMON.REFRESH')}
        </button>
      </header>

      <QueueNav queue={queue} active="workers" onSelect={onSelectView} showMetrics={showMetrics} />

      {status === 'loading' ? (
        <p className="dash-status">{t('WORKERS.LOADING')}</p>
      ) : status === 'error' ? (
        <p className="dash-status dash-status--error" role="alert">
          {t('WORKERS.LOAD_FAILED')}
        </p>
      ) : workers === null ? (
        <p className="dash-status">{t('WORKERS.CANT_REPORT')}</p>
      ) : workers.length === 0 ? (
        <p className="dash-status">{t('WORKERS.NO_WORKERS')}</p>
      ) : (
        <div className="dash-panel dash-panel--table-frame">
          <table className="dash-table">
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
                    {worker.name ?? <span className="dash-text-muted dash-text-italic">{t('WORKERS.UNNAMED')}</span>}
                  </td>
                  <td>
                    <span className="dash-job-id">{worker.addr}</span>
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

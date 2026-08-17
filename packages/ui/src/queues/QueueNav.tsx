import { useTranslation } from 'react-i18next';
import type { AppQueue } from '../api/contract';

export type QueueViewName = 'jobs' | 'schedulers' | 'workers' | 'redis' | 'flow' | 'metrics';

type QueueNavProps = {
  queue: AppQueue;
  active: QueueViewName;
  onSelect: (view: QueueViewName) => void;
  showMetrics: boolean;
};

const VIEWS: Array<{ name: QueueViewName; labelKey: string }> = [
  { name: 'jobs', labelKey: 'NAV.JOBS' },
  { name: 'schedulers', labelKey: 'NAV.SCHEDULERS' },
  { name: 'workers', labelKey: 'NAV.WORKERS' },
  { name: 'redis', labelKey: 'NAV.REDIS' },
  { name: 'flow', labelKey: 'NAV.FLOW' },
  { name: 'metrics', labelKey: 'NAV.METRICS' },
];

/**
 * The tab strip navigating between a queue's views. Rendered by every queue
 * view so the strip stays put while the view below it changes; `showMetrics`
 * hides the metrics tab when the board config disables it.
 */
export function QueueNav({ queue, active, onSelect, showMetrics }: QueueNavProps) {
  const { t } = useTranslation();
  const views = showMetrics ? VIEWS : VIEWS.filter((view) => view.name !== 'metrics');

  return (
    <div className="queue-nav dash-tab-list" role="group" aria-label={t('NAV.VIEWS_OF', { queue: queue.name })}>
      {views.map((view) => (
        <button
          key={view.name}
          type="button"
          className={`dash-tab dash-focus-ring${active === view.name ? ' dash-tab--selected' : ''}`}
          aria-pressed={active === view.name}
          aria-label={t('NAV.OPEN_VIEW', { view: t(view.labelKey) })}
          onClick={() => onSelect(view.name)}
        >
          {t(view.labelKey)}
        </button>
      ))}
    </div>
  );
}

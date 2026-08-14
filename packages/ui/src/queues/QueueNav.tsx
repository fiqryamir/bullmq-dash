import type { AppQueue } from '../api/contract';

export type QueueViewName = 'jobs' | 'schedulers' | 'workers' | 'redis' | 'flow' | 'metrics';

type QueueNavProps = {
  queue: AppQueue;
  active: QueueViewName;
  onSelect: (view: QueueViewName) => void;
  showMetrics: boolean;
};

const VIEWS: Array<{ name: QueueViewName; label: string }> = [
  { name: 'jobs', label: 'Jobs' },
  { name: 'schedulers', label: 'Schedulers' },
  { name: 'workers', label: 'Workers' },
  { name: 'redis', label: 'Redis' },
  { name: 'flow', label: 'Flow' },
  { name: 'metrics', label: 'Metrics' },
];

/**
 * The tab strip navigating between a queue's views. Rendered by every queue
 * view so the strip stays put while the view below it changes; `showMetrics`
 * hides the metrics tab when the board config disables it.
 */
export function QueueNav({ queue, active, onSelect, showMetrics }: QueueNavProps) {
  const views = showMetrics ? VIEWS : VIEWS.filter((view) => view.name !== 'metrics');

  return (
    <div className="queue-nav" role="group" aria-label={`Views of ${queue.name}`}>
      {views.map((view) => (
        <button
          key={view.name}
          type="button"
          className={`queue-nav__tab${active === view.name ? ' queue-nav__tab--selected' : ''}`}
          aria-pressed={active === view.name}
          aria-label={`Open ${view.label.toLowerCase()} view`}
          onClick={() => onSelect(view.name)}
        >
          {view.label}
        </button>
      ))}
    </div>
  );
}

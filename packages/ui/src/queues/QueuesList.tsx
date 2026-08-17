import { useTranslation } from 'react-i18next';
import type { AppQueue } from '../api/contract';
import { STATUS_KEY } from './statusKeys';

const DISPLAYED_STATES = ['waiting', 'active', 'delayed', 'completed', 'failed'] as const;

function QueueRow({ queue, onSelect }: { queue: AppQueue; onSelect: (queue: AppQueue) => void }) {
  const { t } = useTranslation();
  const chips = DISPLAYED_STATES.map((state) => ({
    state,
    count: queue.counts[state] ?? 0,
  })).filter(({ count }) => count > 0);

  return (
    <li className="queue-item dash-panel">
      <button
        type="button"
        className="queue-item__open dash-button dash-button--ghost dash-focus-ring"
        onClick={() => onSelect(queue)}
      >
        <span className="queue-item__name">{queue.displayName ?? queue.name}</span>
        {queue.isPaused && (
          <span className="dash-chip dash-chip--paused">{t(STATUS_KEY.paused)}</span>
        )}
        <span className="queue-item__counts">
          {chips.map(({ state, count }) => (
            <span key={state} className={`dash-chip dash-chip--${state}`}>
              <span>{count}</span>
              <span>{t(STATUS_KEY[state])}</span>
            </span>
          ))}
        </span>
      </button>
    </li>
  );
}

export function QueuesList({
  queues,
  onSelect,
}: {
  queues: AppQueue[];
  onSelect: (queue: AppQueue) => void;
}) {
  return (
    <ul className="queue-list">
      {queues.map((queue) => (
        <QueueRow key={queue.name} queue={queue} onSelect={onSelect} />
      ))}
    </ul>
  );
}

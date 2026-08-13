import type { AppQueue } from '../api/contract';

const DISPLAYED_STATES = ['waiting', 'active', 'delayed', 'completed', 'failed'] as const;

function QueueRow({ queue }: { queue: AppQueue }) {
  const chips = DISPLAYED_STATES.map((state) => ({
    state,
    count: queue.counts[state] ?? 0,
  })).filter(({ count }) => count > 0);

  return (
    <li className="queue-item">
      <span className="queue-item__name">{queue.displayName ?? queue.name}</span>
      {queue.isPaused && <span className="queue-item__paused">paused</span>}
      <span className="queue-item__counts">
        {chips.map(({ state, count }) => (
          <span key={state} className={`chip chip--${state}`}>
            <span className="chip__count">{count}</span>
            <span className="chip__state">{state}</span>
          </span>
        ))}
      </span>
    </li>
  );
}

export function QueuesList({ queues }: { queues: AppQueue[] }) {
  return (
    <ul className="queue-list">
      {queues.map((queue) => (
        <QueueRow key={queue.name} queue={queue} />
      ))}
    </ul>
  );
}

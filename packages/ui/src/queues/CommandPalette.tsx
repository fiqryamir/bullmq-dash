import { useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTranslation } from 'react-i18next';
import type { JobStatus, SearchResult } from '../api/contract';
import { JOB_STATES } from './QueueJobs';
import { STATUS_KEY } from './statusKeys';
import { useJobSearch } from './useJobSearch';

const RESULT_ROW_HEIGHT = 40;

type CommandPaletteProps = {
  onSelectJob: (result: SearchResult) => void;
  /** Scopes the search to a single queue; absent, the search spans every queue. */
  queueName?: string;
};

/**
 * The live job-search palette: a 300ms-debounced search (across every queue,
 * or scoped to one when `queueName` is given), state chips narrowing the
 * search, a virtualized result list, and a deepen button that continues past
 * the server's result cap.
 */
export function CommandPalette({ onSelectJob, queueName }: CommandPaletteProps) {
  const { t } = useTranslation();
  const [term, setTerm] = useState('');
  const [states, setStates] = useState<JobStatus[]>([]);
  const { results, status, deepen, deepenSearch } = useJobSearch(term, states, queueName);
  const scrollRef = useRef<HTMLDivElement>(null);

  const toggleState = (state: JobStatus) => {
    setStates((current) =>
      current.includes(state) ? current.filter((entry) => entry !== state) : [...current, state]
    );
  };

  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => RESULT_ROW_HEIGHT,
    overscan: 10,
  });

  return (
    <section className="command-palette" aria-label={t('SEARCH.VIEW_ARIA')}>
      <input
        type="search"
        className="command-bar"
        placeholder={
          queueName
            ? t('SEARCH.PLACEHOLDER_QUEUE', { queue: queueName })
            : t('SEARCH.PLACEHOLDER_GLOBAL')
        }
        aria-label={t('SEARCH.ARIA')}
        value={term}
        onChange={(event) => setTerm(event.target.value)}
      />
      <div className="command-palette__states" role="group" aria-label={t('SEARCH.STATES_ARIA')}>
        {JOB_STATES.map((state) => (
          <button
            key={state}
            type="button"
            aria-pressed={states.includes(state)}
            className={`state-tab state-tab--${state}${states.includes(state) ? ' state-tab--selected' : ''}`}
            onClick={() => toggleState(state)}
          >
            {t(STATUS_KEY[state])}
          </button>
        ))}
      </div>
      {status === 'loading' && results.length === 0 && term.trim() !== '' && (
        <p className="queues-status">{t('SEARCH.SEARCHING')}</p>
      )}
      {status === 'error' && results.length === 0 && (
        <p className="queues-status queues-status--error">{t('SEARCH.FAILED')}</p>
      )}
      {status === 'ready' && results.length === 0 && term.trim() !== '' && (
        <p className="queues-status">{t('SEARCH.NO_MATCH')}</p>
      )}
      {results.length > 0 && (
        <>
          <div className="command-palette__results" data-testid="palette-scroll" ref={scrollRef}>
            <ul className="command-palette__list" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const result = results[virtualRow.index];
                if (!result) {
                  return null;
                }
                return (
                  <li
                    key={`${result.queue}:${result.job.id}`}
                    className="command-palette__row"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <button
                      type="button"
                      className="command-palette__result"
                      onClick={() => onSelectJob(result)}
                    >
                      <span className="command-palette__id">{result.job.id}</span>
                      <span className="command-palette__name">{result.job.name}</span>
                      <span className={`chip chip--${result.state}`}>{t(STATUS_KEY[result.state])}</span>
                      {!queueName && <span className="command-palette__queue">{result.queue}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          {deepen && (
            <button
              type="button"
              className="action-btn command-palette__deepen"
              onClick={() => void deepenSearch()}
              disabled={status === 'loading'}
            >
              {t('SEARCH.DEEPEN')}
            </button>
          )}
        </>
      )}
    </section>
  );
}

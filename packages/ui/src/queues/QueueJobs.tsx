import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTranslation } from 'react-i18next';
import type { AppJob, AppQueue, JobStatus } from '../api/contract';
import {
  cleanJobs,
  emptyQueue,
  pauseQueue,
  promoteJob,
  promoteJobs,
  removeJob,
  removeJobs,
  resumeQueue,
  retryJob,
  retryJobs,
} from '../api/contract';
import { formatProgress } from './formatProgress';
import { CommandPalette } from './CommandPalette';
import { QueueNav, type QueueViewName } from './QueueNav';
import { STATUS_KEY } from './statusKeys';
import { useQueueJobs } from './useQueueJobs';

export const JOB_STATES: JobStatus[] = [
  'waiting',
  'active',
  'completed',
  'failed',
  'delayed',
  'paused',
];

const JOBS_PER_PAGE = 100;

function stateCount(queue: AppQueue, state: JobStatus): number {
  if (state === 'paused' && queue.isPaused) {
    return queue.counts.waiting ?? 0;
  }
  return queue.counts[state] ?? 0;
}

type QueueJobsProps = {
  queue: AppQueue;
  pollingInterval?: number;
  onBack: () => void;
  onSelectJob: (job: AppJob) => void;
  onSelectView: (view: QueueViewName) => void;
  showMetrics?: boolean;
};

type RowAction = { labelKey: string; ariaKey: string; run: () => Promise<unknown> | void };

/**
 * The row actions each state offers, in order. Active jobs hold a worker lock
 * and cannot be removed, so the active state offers none.
 */
const ROW_ACTIONS_PER_STATE: Record<JobStatus, Array<'retry' | 'promote' | 'remove'>> = {
  waiting: ['remove'],
  active: [],
  completed: ['retry', 'remove'],
  failed: ['retry', 'remove'],
  delayed: ['promote', 'remove'],
  paused: ['remove'],
  'waiting-children': [],
  prioritized: [],
};

function rowActionsFor(job: AppJob, queue: AppQueue): RowAction[] {
  if (!job.id) {
    return [];
  }

  const actions: RowAction[] = [];
  const kinds = ROW_ACTIONS_PER_STATE[job.state ?? 'waiting'];

  for (const kind of kinds) {
    switch (kind) {
      case 'retry': {
        const allowed =
          job.state === 'completed'
            ? queue.allowCompletedRetries !== false
            : queue.allowRetries !== false;
        if (allowed) {
          actions.push({
            labelKey: 'JOB.ACTIONS.RETRY',
            ariaKey: 'QUEUE_JOBS.RETRY_JOB',
            run: () => retryJob(queue.name, job.id!),
          });
        }
        break;
      }
      case 'promote':
        actions.push({
          labelKey: 'JOB.ACTIONS.PROMOTE',
          ariaKey: 'QUEUE_JOBS.PROMOTE_JOB',
          run: () => promoteJob(queue.name, job.id!),
        });
        break;
      case 'remove':
        actions.push({
          labelKey: 'COMMON.REMOVE',
          ariaKey: 'QUEUE_JOBS.REMOVE_JOB',
          run: () => removeJob(queue.name, job.id!),
        });
        break;
    }
  }

  return actions;
}

type BulkActionSpec = {
  labelKey: string;
  confirmKey?: string;
  variant: 'primary' | 'ghost';
  run: (queue: AppQueue) => Promise<unknown>;
  allowed?: (queue: AppQueue) => boolean;
};

const removeAllAction = (status: JobStatus): BulkActionSpec => ({
  labelKey: 'QUEUE_JOBS.REMOVE_ALL',
  confirmKey: 'QUEUE_JOBS.REMOVE_ALL_CONFIRM',
  variant: 'ghost',
  run: (queue) => removeJobs(queue.name, status),
});

const retryAllAction = (status: 'failed' | 'completed'): BulkActionSpec => ({
  labelKey: 'QUEUE_JOBS.RETRY_ALL',
  variant: 'primary',
  run: (queue) => retryJobs(queue.name, status),
  allowed: (queue) =>
    status === 'completed' ? queue.allowCompletedRetries !== false : queue.allowRetries !== false,
});

const cleanAction = (status: 'failed' | 'completed'): BulkActionSpec => ({
  labelKey: 'QUEUE_JOBS.CLEAN',
  confirmKey: 'QUEUE_JOBS.CLEAN_CONFIRM',
  variant: 'ghost',
  run: (queue) => cleanJobs(queue.name, status, DEFAULT_CLEAN_GRACE_SECONDS),
});

const promoteAllAction: BulkActionSpec = {
  labelKey: 'QUEUE_JOBS.PROMOTE_ALL_DELAYED',
  variant: 'primary',
  run: (queue) => promoteJobs(queue.name),
};

const BULK_ACTIONS_PER_STATE: Record<JobStatus, BulkActionSpec[]> = {
  waiting: [removeAllAction('waiting')],
  active: [],
  completed: [retryAllAction('completed'), cleanAction('completed'), removeAllAction('completed')],
  failed: [retryAllAction('failed'), cleanAction('failed'), removeAllAction('failed')],
  delayed: [promoteAllAction, removeAllAction('delayed')],
  paused: [removeAllAction('paused')],
  'waiting-children': [],
  prioritized: [],
};

const DEFAULT_CLEAN_GRACE_SECONDS = 5;

export function QueueJobs({
  queue,
  pollingInterval,
  onBack,
  onSelectJob,
  onSelectView,
  showMetrics = true,
}: QueueJobsProps) {
  const { t } = useTranslation();
  const [activeState, setActiveState] = useState<JobStatus>('waiting');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [pausedOverride, setPausedOverride] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { jobs, pagination, status } = useQueueJobs(
    queue.name,
    activeState,
    page,
    JOBS_PER_PAGE,
    pollingInterval,
    revision
  );

  const isPaused = pausedOverride ?? queue.isPaused;
  const pageCount = pagination?.pageCount ?? 0;
  const activeStateLabel = t(STATUS_KEY[activeState]);

  useEffect(() => {
    if (pageCount > 0 && page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  const runAction = useCallback(
    async (action: () => Promise<unknown> | void, after?: () => void) => {
      setBusy(true);
      setActionFailed(false);
      try {
        await action();
        after?.();
        setRevision((current) => current + 1);
      } catch {
        setActionFailed(true);
      } finally {
        setBusy(false);
      }
    },
    []
  );

  // Bulk labels interpolate the translated state label (bull-board's own
  // confirmations do the same), so the sentence translates in every locale.
  const bulkActions = useMemo(
    () =>
      BULK_ACTIONS_PER_STATE[activeState]
        .filter((spec) => spec.allowed?.(queue) ?? true)
        .map((spec) => ({
          label: t(spec.labelKey, { status: activeStateLabel }),
          variant: spec.variant,
          run: () =>
            runAction(async () => {
              if (spec.confirmKey) {
                const message = t(spec.confirmKey, {
                  status: activeStateLabel,
                  queue: queue.name,
                });
                if (!window.confirm(message)) {
                  return;
                }
              }
              await spec.run(queue);
            }),
        })),
    [activeState, activeStateLabel, queue, runAction, t]
  );

  const togglePause = () => {
    void runAction(
      () => (isPaused ? resumeQueue(queue.name) : pauseQueue(queue.name)),
      () => setPausedOverride(!isPaused)
    );
  };

  const empty = () => {
    void runAction(async () => {
      if (!window.confirm(t('QUEUE_JOBS.EMPTY_CONFIRM', { queue: queue.name }))) {
        return;
      }
      await emptyQueue(queue.name);
    });
  };

  const columns = useMemo<ColumnDef<AppJob>[]>(
    () => [
      {
        accessorKey: 'id',
        header: t('COMMON.ID'),
        cell: (info) => <span className="job-cell__id">{String(info.getValue())}</span>,
      },
      { accessorKey: 'name', header: t('COMMON.NAME') },
      {
        accessorKey: 'state',
        header: t('COMMON.STATE'),
        cell: (info) => {
          const state = info.getValue() as JobStatus | null;
          const chipState =
            state === 'waiting-children' ? 'delayed' : state === 'prioritized' ? 'active' : state;
          return (
            <span className={`dash-chip dash-chip--${String(chipState ?? '')}`}>
              {state ? t(STATUS_KEY[state]) : ''}
            </span>
          );
        },
      },
      {
        accessorKey: 'progress',
        header: t('COMMON.PROGRESS'),
        cell: (info) => formatProgress(info.getValue() as number | object),
      },
      { accessorKey: 'attempts', header: t('COMMON.ATTEMPTS') },
      ...(queue.readOnlyMode
        ? []
        : [
            {
              id: 'actions',
              header: t('COMMON.ACTIONS'),
              cell: (info: { row: { original: AppJob } }) => {
                const job = info.row.original;
                return (
                  <span className="job-cell__actions">
                    {rowActionsFor(job, queue).map((action) => (
                      <button
                        key={action.labelKey}
                        type="button"
                        className="dash-button dash-button--ghost dash-focus-ring"
                        aria-label={t(action.ariaKey, { id: job.id })}
                        disabled={busy}
                        onClick={(event) => {
                          event.stopPropagation();
                          void runAction(action.run);
                        }}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        {t(action.labelKey)}
                      </button>
                    ))}
                  </span>
                );
              },
            } as ColumnDef<AppJob>,
          ]),
    ],
    [queue, busy, runAction, t]
  );

  const table = useReactTable({
    data: jobs,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  const { rows } = table.getRowModel();

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 10,
  });

  const selectState = (state: JobStatus) => {
    setActiveState(state);
    setPage(1);
  };

  return (
    <section className="queue-jobs" aria-label={t('QUEUE_JOBS.VIEW_ARIA', { queue: queue.name })}>
      <header className="queue-jobs__header">
        <button
          type="button"
          className="dash-button dash-button--ghost dash-focus-ring"
          onClick={onBack}
        >
          {t('COMMON.BACK')}
        </button>
        <h1 className="queue-jobs__title">{queue.name}</h1>
        {isPaused && <span className="dash-chip dash-chip--paused">{t(STATUS_KEY.paused)}</span>}
        {!queue.readOnlyMode && (
          <div className="queue-jobs__actions" role="group" aria-label={t('COMMON.QUEUE_ACTIONS')}>
            <button
              type="button"
              className="dash-button dash-button--ghost dash-focus-ring"
              onClick={togglePause}
              disabled={busy}
              aria-label={t(isPaused ? 'QUEUE_JOBS.RESUME_ARIA' : 'QUEUE_JOBS.PAUSE_ARIA')}
            >
              {t(isPaused ? 'QUEUE.ACTIONS.RESUME' : 'QUEUE.ACTIONS.PAUSE')}
            </button>
            <button
              type="button"
              className="dash-button dash-button--ghost dash-focus-ring"
              onClick={empty}
              disabled={busy}
              aria-label={t('QUEUE_JOBS.EMPTY_ARIA')}
            >
              {t('QUEUE.ACTIONS.EMPTY')}
            </button>
          </div>
        )}
      </header>

      <QueueNav queue={queue} active="jobs" onSelect={onSelectView} showMetrics={showMetrics} />

      <CommandPalette
        queueName={queue.name}
        onSelectJob={(result) => {
          if (result.job.id) {
            onSelectJob(result.job);
          }
        }}
      />

      <div className="queue-jobs__states" role="group" aria-label={t('COMMON.JOB_STATES')}>
        {JOB_STATES.map((state) => (
          <button
            key={state}
            type="button"
            aria-pressed={state === activeState}
            className={`dash-tab dash-tab--${state} dash-focus-ring${state === activeState ? ' dash-tab--selected' : ''}`}
            onClick={() => selectState(state)}
          >
            <span>{stateCount(queue, state)}</span>
            <span>{t(STATUS_KEY[state])}</span>
          </button>
        ))}
      </div>

      {!queue.readOnlyMode && bulkActions.length > 0 && (
        <div
          className="queue-jobs__bulk"
          role="group"
          aria-label={t('QUEUE_JOBS.BULK_ARIA', { status: activeStateLabel })}
        >
          {bulkActions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={`dash-button dash-button--${action.variant} dash-focus-ring`}
              onClick={() => void runAction(action.run)}
              disabled={busy}
            >
              {action.label}
            </button>
          ))}
          {actionFailed && (
            <span className="queues-status queues-status--error" role="alert">
              {t('COMMON.ACTION_FAILED')}
            </span>
          )}
        </div>
      )}

      <div className="queue-jobs__table-wrap" data-testid="jobs-scroll" ref={scrollRef}>
        <table className="dash-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              if (!row) {
                return null;
              }
              return (
                <tr
                  key={row.id}
                  className="dash-focus-ring"
                  tabIndex={0}
                  onClick={() => onSelectJob(row.original)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectJob(row.original);
                    }
                  }}
                  style={{
                    position: 'absolute',
                    top: 0,
                    transform: `translateY(${virtualRow.start}px)`,
                    width: '100%',
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer className="queue-jobs__footer">
        {status === 'loading' ? (
          <span className="queues-status">{t('QUEUE_JOBS.LOADING')}</span>
        ) : status === 'error' ? (
          <span className="queues-status queues-status--error">{t('QUEUE_JOBS.LOAD_FAILED')}</span>
        ) : jobs.length === 0 ? (
          <span className="queues-status">{t('QUEUE_JOBS.NO_JOBS_IN_STATE')}</span>
        ) : (
          <span className="queues-status dash-pager__status">
            {t('COMMON.PAGE_OF', { page, pageCount })}
          </span>
        )}
        {pageCount > 0 && (
          <div className="dash-pager">
            <button
              type="button"
              className="dash-pager__button dash-focus-ring"
              aria-label={t('COMMON.PREV_PAGE')}
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              {t('COMMON.PREV')}
            </button>
            <button
              type="button"
              className="dash-pager__button dash-focus-ring"
              aria-label={t('COMMON.NEXT_PAGE')}
              disabled={page >= pageCount}
              onClick={() => setPage((current) => current + 1)}
            >
              {t('COMMON.NEXT')}
            </button>
          </div>
        )}
      </footer>
    </section>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
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
};

type RowAction = { label: string; run: () => Promise<unknown> | void };

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
          actions.push({ label: 'Retry', run: () => retryJob(queue.name, job.id!) });
        }
        break;
      }
      case 'promote':
        actions.push({ label: 'Promote', run: () => promoteJob(queue.name, job.id!) });
        break;
      case 'remove':
        actions.push({ label: 'Remove', run: () => removeJob(queue.name, job.id!) });
        break;
    }
  }

  return actions;
}

type BulkActionSpec = {
  label: string;
  run: (queue: AppQueue) => Promise<unknown>;
  confirm?: (queue: AppQueue) => string;
  allowed?: (queue: AppQueue) => boolean;
};

const removeAllAction = (status: JobStatus): BulkActionSpec => ({
  label: `Remove all ${status}`,
  run: (queue) => removeJobs(queue.name, status),
  confirm: (queue) => `Remove all ${status} jobs in ${queue.name}?`,
});

const retryAllAction = (status: 'failed' | 'completed'): BulkActionSpec => ({
  label: `Retry all ${status}`,
  run: (queue) => retryJobs(queue.name, status),
  allowed: (queue) =>
    status === 'completed' ? queue.allowCompletedRetries !== false : queue.allowRetries !== false,
});

const cleanAction = (status: 'failed' | 'completed'): BulkActionSpec => ({
  label: `Clean ${status}`,
  run: (queue) => cleanJobs(queue.name, status, DEFAULT_CLEAN_GRACE_SECONDS),
  confirm: (queue) => `Clean ${status} jobs in ${queue.name}?`,
});

const promoteAllAction: BulkActionSpec = {
  label: 'Promote all delayed',
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

export function QueueJobs({ queue, pollingInterval, onBack, onSelectJob }: QueueJobsProps) {
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

  const bulkActions = useMemo(
    () =>
      BULK_ACTIONS_PER_STATE[activeState]
        .filter((spec) => spec.allowed?.(queue) ?? true)
        .map((spec) => ({
          label: spec.label,
          run: () =>
            runAction(async () => {
              const message = spec.confirm?.(queue);
              if (message && !window.confirm(message)) {
                return;
              }
              await spec.run(queue);
            }),
        })),
    [activeState, queue, runAction]
  );

  const togglePause = () => {
    void runAction(
      () => (isPaused ? resumeQueue(queue.name) : pauseQueue(queue.name)),
      () => setPausedOverride(!isPaused)
    );
  };

  const empty = () => {
    void runAction(async () => {
      if (!window.confirm(`Empty ${queue.name}?`)) {
        return;
      }
      await emptyQueue(queue.name);
    });
  };

  const columns = useMemo<ColumnDef<AppJob>[]>(
    () => [
      {
        accessorKey: 'id',
        header: 'ID',
        cell: (info) => <span className="job-cell__id">{String(info.getValue())}</span>,
      },
      { accessorKey: 'name', header: 'Name' },
      {
        accessorKey: 'state',
        header: 'State',
        cell: (info) => (
          <span className={`chip chip--${String(info.getValue() ?? '')}`}>
            {String(info.getValue() ?? '')}
          </span>
        ),
      },
      {
        accessorKey: 'progress',
        header: 'Progress',
        cell: (info) => formatProgress(info.getValue() as number | object),
      },
      { accessorKey: 'attempts', header: 'Attempts' },
      ...(queue.readOnlyMode
        ? []
        : [
            {
              id: 'actions',
              header: 'Actions',
              cell: (info: { row: { original: AppJob } }) => (
                <span className="job-cell__actions">
                  {rowActionsFor(info.row.original, queue).map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      className="action-btn"
                      aria-label={`${action.label} job ${info.row.original.id}`}
                      disabled={busy}
                      onClick={(event) => {
                        event.stopPropagation();
                        void runAction(action.run);
                      }}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      {action.label}
                    </button>
                  ))}
                </span>
              ),
            } as ColumnDef<AppJob>,
          ]),
    ],
    [queue, busy, runAction]
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
    <section className="queue-jobs" aria-label={`Jobs in ${queue.name}`}>
      <header className="queue-jobs__header">
        <button type="button" className="queue-jobs__back" onClick={onBack}>
          ← Back
        </button>
        <h1 className="queue-jobs__title">{queue.name}</h1>
        {isPaused && <span className="queue-item__paused">paused</span>}
        {!queue.readOnlyMode && (
          <div className="queue-jobs__actions" role="group" aria-label="Queue actions">
            <button
              type="button"
              className="action-btn"
              onClick={togglePause}
              disabled={busy}
              aria-label={isPaused ? 'Resume queue' : 'Pause queue'}
            >
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            <button
              type="button"
              className="action-btn"
              onClick={empty}
              disabled={busy}
              aria-label="Empty queue"
            >
              Empty
            </button>
          </div>
        )}
      </header>

      <div className="queue-jobs__states" role="group" aria-label="Job states">
        {JOB_STATES.map((state) => (
          <button
            key={state}
            type="button"
            aria-pressed={state === activeState}
            className={`state-tab state-tab--${state}${state === activeState ? ' state-tab--selected' : ''}`}
            onClick={() => selectState(state)}
          >
            <span className="state-tab__count">{stateCount(queue, state)}</span>
            <span className="state-tab__name">{state}</span>
          </button>
        ))}
      </div>

      {!queue.readOnlyMode && bulkActions.length > 0 && (
        <div className="queue-jobs__bulk" role="group" aria-label={`Bulk actions for ${activeState} jobs`}>
          {bulkActions.map((action) => (
            <button
              key={action.label}
              type="button"
              className="action-btn"
              onClick={() => void runAction(action.run)}
              disabled={busy}
            >
              {action.label}
            </button>
          ))}
          {actionFailed && (
            <span className="queues-status queues-status--error" role="alert">
              Action failed
            </span>
          )}
        </div>
      )}

      <div className="queue-jobs__table-wrap" data-testid="jobs-scroll" ref={scrollRef}>
        <table className="job-table">
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
                  className="job-table__row"
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
          <span className="queues-status">Loading jobs…</span>
        ) : status === 'error' ? (
          <span className="queues-status queues-status--error">Failed to load jobs</span>
        ) : jobs.length === 0 ? (
          <span className="queues-status">No jobs in this state</span>
        ) : (
          <span className="queues-status">
            Page {page} of {pageCount}
          </span>
        )}
        {pageCount > 0 && (
          <div className="queue-jobs__pager">
            <button
              type="button"
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Prev
            </button>
            <button
              type="button"
              aria-label="Next page"
              disabled={page >= pageCount}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </div>
        )}
      </footer>
    </section>
  );
}

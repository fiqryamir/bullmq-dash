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

function rowActionsFor(job: AppJob, queue: AppQueue): RowAction[] {
  if (!job.id) {
    return [];
  }

  const actions: RowAction[] = [];

  if ((job.state === 'failed' && queue.allowRetries !== false) ||
      (job.state === 'completed' && queue.allowCompletedRetries !== false)) {
    actions.push({ label: 'Retry', run: () => retryJob(queue.name, job.id!) });
  }

  if (job.state === 'delayed') {
    actions.push({ label: 'Promote', run: () => promoteJob(queue.name, job.id!) });
  }

  actions.push({ label: 'Remove', run: () => removeJob(queue.name, job.id!) });

  return actions;
}

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

  const bulkActions = useMemo(() => {
    const actions: RowAction[] = [];
    const run = (action: () => Promise<unknown>, label: string, confirmMessage?: string) => {
      actions.push({
        label,
        run: () =>
          runAction(async () => {
            if (confirmMessage && !window.confirm(confirmMessage)) {
              return;
            }
            await action();
          }),
      });
    };

    if (activeState === 'failed') {
      if (queue.allowRetries !== false) {
        run(() => retryJobs(queue.name, 'failed'), 'Retry all failed');
      }
      run(() => removeJobs(queue.name, 'failed'), 'Remove all failed', `Remove all failed jobs in ${queue.name}?`);
    } else if (activeState === 'completed') {
      if (queue.allowCompletedRetries !== false) {
        run(() => retryJobs(queue.name, 'completed'), 'Retry all completed');
      }
      run(
        () => cleanJobs(queue.name, 'completed', 5),
        'Clean completed',
        `Clean completed jobs in ${queue.name}?`
      );
      run(() => removeJobs(queue.name, 'completed'), 'Remove all completed', `Remove all completed jobs in ${queue.name}?`);
    } else if (activeState === 'delayed') {
      run(() => promoteJobs(queue.name), 'Promote all delayed');
      run(() => removeJobs(queue.name, 'delayed'), 'Remove all delayed', `Remove all delayed jobs in ${queue.name}?`);
    } else if (activeState === 'waiting' || activeState === 'paused') {
      run(
        () => removeJobs(queue.name, activeState),
        `Remove all ${activeState}`,
        `Remove all ${activeState} jobs in ${queue.name}?`
      );
    }

    return actions;
  }, [activeState, queue, runAction]);

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

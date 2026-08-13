import { useEffect, useMemo, useRef, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { AppJob, AppQueue, JobStatus } from '../api/contract';
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

function formatProgress(progress: number | object): string {
  return typeof progress === 'number' ? `${progress}%` : JSON.stringify(progress);
}

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
};

export function QueueJobs({ queue, pollingInterval, onBack }: QueueJobsProps) {
  const [activeState, setActiveState] = useState<JobStatus>('waiting');
  const [page, setPage] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { jobs, pagination, status } = useQueueJobs(
    queue.name,
    activeState,
    page,
    JOBS_PER_PAGE,
    pollingInterval
  );

  const pageCount = pagination?.pageCount ?? 0;

  useEffect(() => {
    if (pageCount > 0 && page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  const columns = useMemo<ColumnDef<AppJob>[]>(    () => [
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
          <span className={`chip chip--${String(info.getValue())}`}>{String(info.getValue())}</span>
        ),
      },
      {
        accessorKey: 'progress',
        header: 'Progress',
        cell: (info) => formatProgress(info.getValue() as number | object),
      },
      { accessorKey: 'attempts', header: 'Attempts' },
    ],
    []
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
        {queue.isPaused && <span className="queue-item__paused">paused</span>}
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

      <div className="queue-jobs__table-wrap" ref={scrollRef}>
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

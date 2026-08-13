import { useEffect, useState } from 'react';
import type { AppQueue } from '../api/contract';
import { formatProgress } from './formatProgress';
import { useJobDetail } from './useJobDetail';
import { useJobLogs } from './useJobLogs';

const LOGS_PER_PAGE = 100;

function json(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? '';
}

type JobDetailProps = {
  queue: AppQueue;
  jobId: string;
  pollingInterval?: number;
  onBack: () => void;
};

export function JobDetail({ queue, jobId, pollingInterval, onBack }: JobDetailProps) {
  const { detail, status } = useJobDetail(queue.name, jobId, pollingInterval);
  const [logsPage, setLogsPage] = useState(1);
  const { logs, pagination, status: logsStatus } = useJobLogs(
    queue.name,
    jobId,
    logsPage,
    LOGS_PER_PAGE,
    pollingInterval
  );

  const logsPageCount = pagination?.pageCount ?? 0;

  useEffect(() => {
    if (logsPageCount > 0 && logsPage > logsPageCount) {
      setLogsPage(logsPageCount);
    }
  }, [logsPage, logsPageCount]);

  const job = detail?.job;

  return (
    <section className="job-detail" aria-label={`Job ${jobId} in ${queue.name}`}>
      <header className="job-detail__header">
        <button type="button" className="job-detail__back" onClick={onBack}>
          ← Back
        </button>
        <h1 className="job-detail__title">{queue.name}</h1>
        {job?.name && <span className="job-detail__job-name">{job.name}</span>}
        <span className="job-cell__id">#{jobId}</span>
        {detail && <span className={`chip chip--${detail.status}`}>{detail.status}</span>}
      </header>

      {status === 'loading' ? (
        <p className="queues-status">Loading job…</p>
      ) : status === 'error' || !job ? (
        <p className="queues-status queues-status--error">Failed to load job</p>
      ) : (
        <>
          <dl className="job-detail__meta">
            <div>
              <dt>Progress</dt>
              <dd>{formatProgress(job.progress)}</dd>
            </div>
            <div>
              <dt>Attempts</dt>
              <dd>{job.attempts}</dd>
            </div>
            <div>
              <dt>Added on</dt>
              <dd>{new Date(job.timestamp).toISOString()}</dd>
            </div>
          </dl>

          <section className="job-detail__section" aria-label="Job data">
            <h2 className="job-detail__section-title">Data</h2>
            <pre className="job-detail__code">{json(job.data)}</pre>
          </section>

          <section className="job-detail__section" aria-label="Job options">
            <h2 className="job-detail__section-title">Options</h2>
            <pre className="job-detail__code">{json(job.opts)}</pre>
          </section>

          {job.failedReason !== undefined && (
            <section className="job-detail__section" aria-label="Failed reason">
              <h2 className="job-detail__section-title">Failed reason</h2>
              <pre className="job-detail__code">{job.failedReason}</pre>
            </section>
          )}

          {job.stacktrace.length > 0 && (
            <section className="job-detail__section" aria-label="Stacktrace">
              <h2 className="job-detail__section-title">Stacktrace</h2>
              <pre className="job-detail__code">{job.stacktrace.join('\n')}</pre>
            </section>
          )}

          <section className="job-detail__section" aria-label="Logs">
            <h2 className="job-detail__section-title">Logs</h2>
            {logsStatus === 'loading' ? (
              <p className="queues-status">Loading logs…</p>
            ) : logsStatus === 'error' ? (
              <p className="queues-status queues-status--error">Failed to load logs</p>
            ) : logs.length === 0 ? (
              <p className="queues-status">No logs</p>
            ) : (
              <>
                <ul className="job-detail__logs">
                  {logs.map((log, index) => (
                    <li key={index} className="job-detail__log">
                      {log}
                    </li>
                  ))}
                </ul>
                <footer className="job-detail__pager">
                  <span className="queues-status">
                    Page {logsPage} of {logsPageCount}
                  </span>
                  <div className="queue-jobs__pager">
                    <button
                      type="button"
                      aria-label="Previous logs page"
                      disabled={logsPage <= 1}
                      onClick={() => setLogsPage((current) => current - 1)}
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      aria-label="Next logs page"
                      disabled={logsPage >= logsPageCount}
                      onClick={() => setLogsPage((current) => current + 1)}
                    >
                      Next
                    </button>
                  </div>
                </footer>
              </>
            )}
          </section>
        </>
      )}
    </section>
  );
}

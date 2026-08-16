import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppQueue, FlowNode, JobStatus } from '../api/contract';
import { FlowGraph } from './FlowGraph';
import { formatProgress } from './formatProgress';
import { STATUS_KEY } from './statusKeys';
import { useJobDetail } from './useJobDetail';
import { useJobFlow } from './useJobFlow';
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
  onSelectNode: (node: FlowNode) => void;
};

export function JobDetail({ queue, jobId, pollingInterval, onBack, onSelectNode }: JobDetailProps) {
  const { t } = useTranslation();
  const { detail, status } = useJobDetail(queue.name, jobId, pollingInterval);
  const { flow, status: flowStatus } = useJobFlow(queue.name, jobId, pollingInterval);
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
    <section
      className="job-detail"
      aria-label={t('JOB_DETAIL.VIEW_ARIA', { jobId, queue: queue.name })}
    >
      <header className="job-detail__header">
        <button type="button" className="job-detail__back" onClick={onBack}>
          {t('COMMON.BACK')}
        </button>
        <h1 className="job-detail__title">{queue.name}</h1>
        {job?.name && <span className="job-detail__job-name">{job.name}</span>}
        <span className="job-cell__id">#{jobId}</span>
        {detail && <span className={`chip chip--${detail.status}`}>{t(STATUS_KEY[detail.status as JobStatus])}</span>}
      </header>

      {status === 'loading' ? (
        <p className="queues-status">{t('JOB_DETAIL.LOADING')}</p>
      ) : status === 'error' || !job ? (
        <p className="queues-status queues-status--error">{t('JOB_DETAIL.LOAD_FAILED')}</p>
      ) : (
        <>
          <dl className="job-detail__meta">
            <div>
              <dt>{t('COMMON.PROGRESS')}</dt>
              <dd>{formatProgress(job.progress)}</dd>
            </div>
            <div>
              <dt>{t('COMMON.ATTEMPTS')}</dt>
              <dd>{job.attempts}</dd>
            </div>
            <div>
              <dt>{t('JOB_DETAIL.ADDED_ON')}</dt>
              <dd>{new Date(job.timestamp).toISOString()}</dd>
            </div>
          </dl>

          <section className="job-detail__section" aria-label={t('JOB_DETAIL.DATA_ARIA')}>
            <h2 className="job-detail__section-title">{t('JOB.TABS.DATA')}</h2>
            <pre className="job-detail__code">{json(job.data)}</pre>
          </section>

          <section className="job-detail__section" aria-label={t('JOB_DETAIL.OPTIONS_ARIA')}>
            <h2 className="job-detail__section-title">{t('JOB.TABS.OPTIONS')}</h2>
            <pre className="job-detail__code">{json(job.opts)}</pre>
          </section>

          {job.failedReason !== undefined && (
            <section className="job-detail__section" aria-label={t('JOB_DETAIL.FAILED_REASON')}>
              <h2 className="job-detail__section-title">{t('JOB_DETAIL.FAILED_REASON')}</h2>
              <pre className="job-detail__code">{job.failedReason}</pre>
            </section>
          )}

          {job.stacktrace.length > 0 && (
            <section className="job-detail__section" aria-label={t('JOB_DETAIL.STACKTRACE')}>
              <h2 className="job-detail__section-title">{t('JOB_DETAIL.STACKTRACE')}</h2>
              <pre className="job-detail__code">{job.stacktrace.join('\n')}</pre>
            </section>
          )}

          <section className="job-detail__section" aria-label={t('JOB_DETAIL.FLOW')}>
            <h2 className="job-detail__section-title">{t('JOB_DETAIL.FLOW')}</h2>
            {flowStatus === 'loading' ? (
              <p className="queues-status">{t('FLOW.LOADING')}</p>
            ) : flowStatus === 'error' ? (
              <p className="queues-status queues-status--error">{t('FLOW.LOAD_FAILED')}</p>
            ) : !flow || !flow.isFlowNode || !flow.flowRoot ? (
              <p className="queues-status">{t('JOB_DETAIL.NOT_PART_OF_FLOW')}</p>
            ) : (
              <div className="flow-graph flow-graph--section" data-testid="job-flow-graph">
                <FlowGraph
                  roots={[flow.flowRoot]}
                  sourceQueueName={queue.name}
                  onSelectNode={onSelectNode}
                />
              </div>
            )}
          </section>

          <section className="job-detail__section" aria-label={t('JOB.TABS.LOGS')}>
            <h2 className="job-detail__section-title">{t('JOB.TABS.LOGS')}</h2>
            {logsStatus === 'loading' ? (
              <p className="queues-status">{t('JOB_DETAIL.LOADING_LOGS')}</p>
            ) : logsStatus === 'error' ? (
              <p className="queues-status queues-status--error">{t('JOB_DETAIL.LOAD_LOGS_FAILED')}</p>
            ) : logs.length === 0 ? (
              <p className="queues-status">{t('JOB_DETAIL.NO_LOGS')}</p>
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
                    {t('COMMON.PAGE_OF', { page: logsPage, pageCount: logsPageCount })}
                  </span>
                  <div className="queue-jobs__pager">
                    <button
                      type="button"
                      aria-label={t('JOB_DETAIL.PREV_LOGS_PAGE')}
                      disabled={logsPage <= 1}
                      onClick={() => setLogsPage((current) => current - 1)}
                    >
                      {t('COMMON.PREV')}
                    </button>
                    <button
                      type="button"
                      aria-label={t('JOB_DETAIL.NEXT_LOGS_PAGE')}
                      disabled={logsPage >= logsPageCount}
                      onClick={() => setLogsPage((current) => current + 1)}
                    >
                      {t('COMMON.NEXT')}
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

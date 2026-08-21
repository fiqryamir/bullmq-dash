import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { AppJob, JobStatus } from '../api/contract';

type Translator = TFunction<'translation', undefined>;

const OUTCOME_KEY: Record<JobStatus | 'unknown', string> = {
  waiting: 'JOB_DETAIL.SUMMARY.OUTCOME_WAITING',
  active: 'JOB_DETAIL.SUMMARY.OUTCOME_ACTIVE',
  delayed: 'JOB_DETAIL.SUMMARY.OUTCOME_DELAYED',
  completed: 'JOB_DETAIL.SUMMARY.OUTCOME_COMPLETED',
  failed: 'JOB_DETAIL.SUMMARY.OUTCOME_FAILED',
  paused: 'JOB_DETAIL.SUMMARY.OUTCOME_PAUSED',
  'waiting-children': 'JOB_DETAIL.SUMMARY.OUTCOME_WAITING_CHILDREN',
  prioritized: 'JOB_DETAIL.SUMMARY.OUTCOME_PRIORITIZED',
  unknown: 'JOB_DETAIL.SUMMARY.OUTCOME_UNKNOWN',
};

/**
 * The sentences of the verdict-first diagnostic summary, built only from the
 * evidence BullMQ still retains. Facts that cannot be established become
 * explicit gap sentences — never empty, zero, or inferred values.
 */
export function diagnosticSummary(
  job: AppJob,
  status: JobStatus | 'unknown',
  t: Translator
): string[] {
  const parts: string[] = [];

  if (status === 'failed' && job.failedReason !== undefined) {
    parts.push(t('JOB_DETAIL.SUMMARY.OUTCOME_FAILED_REASON', { reason: job.failedReason }));
  } else {
    parts.push(t(OUTCOME_KEY[status]));
  }

  if (job.attempts > 1) {
    parts.push(t('JOB_DETAIL.SUMMARY.ATTEMPTS_RETRIED', { count: job.attempts }));
  }

  if (status === 'active') {
    if (job.processedOn !== undefined) {
      parts.push(
        t('JOB_DETAIL.SUMMARY.ACTIVE_STARTED', { time: new Date(job.processedOn).toISOString() })
      );
    }
    if (job.processedBy !== undefined) {
      parts.push(t('JOB_DETAIL.SUMMARY.ACTIVE_WORKER', { worker: job.processedBy }));
    }
    parts.push(t('JOB_DETAIL.SUMMARY.NEXT_REFRESH'));
    return parts;
  }

  if (status !== 'completed' && status !== 'failed') {
    if (status !== 'unknown') {
      parts.push(t('JOB_DETAIL.SUMMARY.NEXT_REFRESH'));
    }
    return parts;
  }

  const hasTiming = job.processedOn !== undefined && job.finishedOn !== undefined;
  const hasWorker = job.processedBy !== undefined;
  const hasRunEvidence = job.processedOn !== undefined || job.finishedOn !== undefined || hasWorker;
  if (!hasRunEvidence) {
    parts.push(t('JOB_DETAIL.SUMMARY.GAP_RUN_EVIDENCE'));
  } else {
    if (!hasWorker) {
      parts.push(t('JOB_DETAIL.SUMMARY.GAP_WORKER'));
    }
    if (!hasTiming) {
      parts.push(t('JOB_DETAIL.SUMMARY.GAP_TIMING'));
    }
  }


  if (status === 'failed' && job.stacktrace.length > 0) {
    parts.push(t('JOB_DETAIL.SUMMARY.NEXT_STACKTRACE'));
  }
  if (status === 'completed' && job.returnValue !== undefined) {
    parts.push(t('JOB_DETAIL.SUMMARY.NEXT_RESULT'));
  }

  return parts;
}

type DiagnosticSummaryProps = {
  job: AppJob;
  status: JobStatus | 'unknown';
};

export function DiagnosticSummary({ job, status }: DiagnosticSummaryProps) {
  const { t } = useTranslation();
  const parts = diagnosticSummary(job, status, t);

  return (
    <p className="dash-status dash-status--summary" data-testid="diagnostic-summary">
      {parts.join(' ')}
    </p>
  );
}

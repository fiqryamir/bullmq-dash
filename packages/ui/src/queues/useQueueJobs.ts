import { useEffect, useState } from 'react';
import {
  fetchQueueJobs,
  type AppJob,
  type JobStatus,
  type JobsPagination,
} from '../api/contract';

export type QueueJobsStatus = 'loading' | 'ready' | 'error';

export function useQueueJobs(
  queueName: string,
  status: JobStatus,
  page: number,
  jobsPerPage: number,
  pollingInterval?: number
) {
  const [jobs, setJobs] = useState<AppJob[]>([]);
  const [pagination, setPagination] = useState<JobsPagination | undefined>();
  const [requestStatus, setRequestStatus] = useState<QueueJobsStatus>('loading');

  useEffect(() => {
    let cancelled = false;

    setJobs([]);
    setRequestStatus('loading');

    const load = async () => {
      try {
        const response = await fetchQueueJobs(queueName, status, page, jobsPerPage);
        if (!cancelled) {
          setJobs(response.jobs);
          setPagination(response.pagination);
          setRequestStatus('ready');
        }
      } catch {
        if (!cancelled) {
          setPagination(undefined);
          setRequestStatus('error');
        }
      }
    };

    void load();

    let timer: ReturnType<typeof setInterval> | undefined;
    if (pollingInterval && pollingInterval > 0) {
      timer = setInterval(() => void load(), pollingInterval);
    }

    return () => {
      cancelled = true;
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [queueName, status, page, jobsPerPage, pollingInterval]);

  return { jobs, pagination, status: requestStatus };
}

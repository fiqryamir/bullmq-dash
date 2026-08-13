export type Status =
  | 'latest'
  | 'active'
  | 'waiting'
  | 'waiting-children'
  | 'prioritized'
  | 'completed'
  | 'failed'
  | 'delayed'
  | 'paused';

export type QueueCounts = Record<Status, number>;

export interface AppQueue {
  name: string;
  displayName?: string;
  counts: QueueCounts;
  isPaused: boolean;
  readOnlyMode: boolean;
}

export interface QueuesResponse {
  queues: AppQueue[];
}

export type JobStatus = Exclude<Status, 'latest'>;

export interface AppJob {
  id: string | undefined;
  name: string;
  state?: JobStatus;
  progress: number | object;
  attempts: number;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  failedReason?: string;
  stacktrace: string[];
  delay?: number;
  opts: object;
  data: unknown;
  returnValue?: unknown;
}

export interface JobsPagination {
  pageCount: number;
  range: { start: number; end: number };
}

export interface QueueJobsResponse {
  jobs: AppJob[];
  pagination: JobsPagination;
}

export interface JobDetailResponse {
  job: AppJob;
  status: JobStatus | 'unknown';
}

export interface JobLogsResponse {
  logs: string[];
  count: number;
  pagination: JobsPagination;
}

export async function fetchQueues(): Promise<QueuesResponse> {
  const response = await fetch('api/queues');
  if (!response.ok) {
    throw new Error(`Queues request failed with status ${response.status}`);
  }
  return (await response.json()) as QueuesResponse;
}

export async function fetchQueueJobs(
  queueName: string,
  status: JobStatus,
  page: number,
  jobsPerPage: number
): Promise<QueueJobsResponse> {
  const params = new URLSearchParams({
    status,
    page: String(page),
    jobsPerPage: String(jobsPerPage),
  });
  const response = await fetch(
    `api/queues/${encodeURIComponent(queueName)}/jobs?${params.toString()}`
  );
  if (!response.ok) {
    throw new Error(`Jobs request failed with status ${response.status}`);
  }
  return (await response.json()) as QueueJobsResponse;
}

export async function fetchJob(queueName: string, jobId: string): Promise<JobDetailResponse> {
  const response = await fetch(
    `api/queues/${encodeURIComponent(queueName)}/${encodeURIComponent(jobId)}`
  );
  if (!response.ok) {
    throw new Error(`Job request failed with status ${response.status}`);
  }
  return (await response.json()) as JobDetailResponse;
}

export async function fetchJobLogs(
  queueName: string,
  jobId: string,
  page: number,
  logsPerPage: number
): Promise<JobLogsResponse> {
  const params = new URLSearchParams({ page: String(page), logsPerPage: String(logsPerPage) });
  const response = await fetch(
    `api/queues/${encodeURIComponent(queueName)}/${encodeURIComponent(jobId)}/logs?${params.toString()}`
  );
  if (!response.ok) {
    throw new Error(`Logs request failed with status ${response.status}`);
  }
  return (await response.json()) as JobLogsResponse;
}

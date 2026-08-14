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
  allowRetries?: boolean;
  allowCompletedRetries?: boolean;
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

export interface SearchResult {
  queue: string;
  job: AppJob;
  state: JobStatus;
}

export interface SearchResponse {
  term: string;
  count: number;
  totalScanned: number;
  deepen: boolean;
  results: SearchResult[];
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

/**
 * Searches jobs by id or name. Without `queueName` the search spans every
 * queue; with it, the search is scoped to that queue's endpoint. `statuses`
 * narrows the search to those states (empty = all states); `start` continues
 * a deepened search from an earlier response's scanned offset.
 */
export async function fetchSearch(
  term: string,
  statuses: JobStatus[],
  start: number,
  queueName?: string
): Promise<SearchResponse> {
  const params = new URLSearchParams({ term });
  if (statuses.length > 0) {
    params.set('status', statuses.join(','));
  }
  if (start > 0) {
    params.set('start', String(start));
  }
  const path = queueName
    ? `api/queues/${encodeURIComponent(queueName)}/search`
    : 'api/search';
  const response = await fetch(`${path}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Search request failed with status ${response.status}`);
  }
  return (await response.json()) as SearchResponse;
}

async function mutate(
  path: string,
  options?: RequestInit
): Promise<Record<string, unknown> | undefined> {
  const response = await fetch(path, { method: 'PUT', ...options });
  if (!response.ok) {
    throw new Error(`Mutation request failed with status ${response.status}`);
  }
  return response.status === 204 ? undefined : ((await response.json()) as Record<string, unknown>);
}

function noContentAction(path: string): Promise<void> {
  return mutate(path).then(() => undefined);
}

export function retryJob(queueName: string, jobId: string): Promise<void> {
  return noContentAction(
    `api/queues/${encodeURIComponent(queueName)}/${encodeURIComponent(jobId)}/retry`
  );
}

export function promoteJob(queueName: string, jobId: string): Promise<void> {
  return noContentAction(
    `api/queues/${encodeURIComponent(queueName)}/${encodeURIComponent(jobId)}/promote`
  );
}

export function removeJob(queueName: string, jobId: string): Promise<void> {
  return noContentAction(
    `api/queues/${encodeURIComponent(queueName)}/${encodeURIComponent(jobId)}/remove`
  );
}

export async function retryJobs(
  queueName: string,
  status: JobStatus
): Promise<{ retried: number; skipped: number }> {
  const body = await mutate(`api/queues/${encodeURIComponent(queueName)}/retry/${status}`);
  return { retried: Number(body?.retried ?? 0), skipped: Number(body?.skipped ?? 0) };
}

export function promoteJobs(queueName: string): Promise<void> {
  return noContentAction(`api/queues/${encodeURIComponent(queueName)}/promote`);
}

export async function cleanJobs(
  queueName: string,
  status: JobStatus,
  graceSeconds: number
): Promise<void> {
  const params = new URLSearchParams({ grace: String(graceSeconds) });
  await mutate(`api/queues/${encodeURIComponent(queueName)}/clean/${status}?${params.toString()}`);
}

export async function removeJobs(
  queueName: string,
  status: JobStatus
): Promise<{ removed: number }> {
  const body = await mutate(`api/queues/${encodeURIComponent(queueName)}/remove/${status}`);
  return { removed: Number(body?.removed ?? 0) };
}

export function pauseQueue(queueName: string): Promise<void> {
  return noContentAction(`api/queues/${encodeURIComponent(queueName)}/pause`);
}

export function resumeQueue(queueName: string): Promise<void> {
  return noContentAction(`api/queues/${encodeURIComponent(queueName)}/resume`);
}

export function emptyQueue(queueName: string): Promise<void> {
  return noContentAction(`api/queues/${encodeURIComponent(queueName)}/empty`);
}

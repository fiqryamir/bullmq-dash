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
  processedBy?: string;
  finishedOn?: number;
  failedReason?: string;
  stacktrace: string[];
  delay?: number;
  opts: object;
  data: unknown;
  returnValue?: unknown;
  isFailed?: boolean;
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

/**
 * One job in a flow tree. `queueName` is the queue the job lives in — flows
 * span queues, so it can differ from the queue the graph was loaded for.
 */
export interface FlowNode {
  id: string;
  name: string;
  state: JobStatus | 'unknown';
  progress: number | object;
  queueName: string;
  children: FlowNode[];
}

/**
 * The per-job flow tree: the requested job's id, whether it is a flow node,
 * and the whole tree from the flow root.
 */
export interface JobFlow {
  nodeId: string;
  isFlowNode: boolean;
  flowRoot: FlowNode | null;
}

/**
 * The queue-level flow graph: every root job in the queue's live states
 * expanded into its child tree. `nodeCount` is the total nodes across the
 * roots and `truncated` says the graph is not the whole pipeline.
 */
export interface QueueFlowResponse {
  roots: FlowNode[];
  nodeCount: number;
  truncated: boolean;
}

/**
 * One minute of a queue's historical metrics. `ts` is the minute start;
 * counts merge the dashboard's event capture with BullMQ's native counters;
 * the averages are null until the minute holds samples of that kind.
 */
export interface MetricsBucket {
  ts: number;
  completed: number;
  failed: number;
  durationAvgMs: number | null;
  waitAvgMs: number | null;
}

export interface QueueMetricsResponse {
  queue: string;
  buckets: MetricsBucket[];
}

/**
 * One repeatable job (job scheduler). `queueName` is filled by the endpoint
 * so the list stays cross-queue; the schedule is either a cron `pattern` or
 * an `every` millisecond interval.
 */
export interface AppJobScheduler {
  id: string;
  name: string;
  pattern?: string;
  every?: number;
  tz?: string;
  limit?: number;
  startDate?: number;
  endDate?: number;
  next?: number;
  nextRunJobId?: string;
  lastRun?: number;
  lastRunJobId?: string;
  iterationCount?: number;
  template?: Record<string, unknown>;
  queueName?: string;
}

export interface JobSchedulersResponse {
  schedulers: AppJobScheduler[];
}

export type JobSchedulerRepeatOptions = {
  pattern?: string;
  every?: number;
  tz?: string;
  limit?: number;
  endDate?: number;
};

export interface QueueWorker {
  id: string;
  name: string | null;
  addr: string;
  age: number;
}

export interface QueueWorkersResponse {
  workers: QueueWorker[] | null;
}

/**
 * Redis/backend info the dashboard reports: version, memory and clients.
 */
export interface RedisStats {
  backend: 'redis';
  version: string;
  mode?: string;
  port?: number;
  os?: string;
  uptime?: number;
  memory: {
    total: number;
    used: number;
    fragmentationRatio: number;
    peak: number;
  };
  clients: {
    connected: number;
    blocked: number;
  };
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

export async function fetchQueueFlow(queueName: string): Promise<QueueFlowResponse> {
  const response = await fetch(`api/queues/${encodeURIComponent(queueName)}/flow`);
  if (!response.ok) {
    throw new Error(`Flow request failed with status ${response.status}`);
  }
  return (await response.json()) as QueueFlowResponse;
}

export async function fetchJobFlow(queueName: string, jobId: string): Promise<JobFlow> {
  const response = await fetch(
    `api/queues/${encodeURIComponent(queueName)}/${encodeURIComponent(jobId)}/flow`
  );
  if (!response.ok) {
    throw new Error(`Job flow request failed with status ${response.status}`);
  }
  return (await response.json()) as JobFlow;
}

/**
 * The queue's historical metrics between `from` and `to` (ms timestamps),
 * as contiguous minute buckets.
 */
export async function fetchQueueMetrics(
  queueName: string,
  from: number,
  to: number
): Promise<QueueMetricsResponse> {
  const params = new URLSearchParams({ from: String(from), to: String(to) });
  const response = await fetch(
    `api/queues/${encodeURIComponent(queueName)}/metrics?${params.toString()}`
  );
  if (!response.ok) {
    throw new Error(`Metrics request failed with status ${response.status}`);
  }
  return (await response.json()) as QueueMetricsResponse;
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

function jsonRequest(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
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

/**
 * The schedulers of one queue (or every queue when `queueName` is omitted).
 */
export async function fetchJobSchedulers(queueName?: string): Promise<JobSchedulersResponse> {
  const params = queueName ? `?${new URLSearchParams({ queueName }).toString()}` : '';
  const response = await fetch(`api/job-schedulers${params}`);
  if (!response.ok) {
    throw new Error(`Schedulers request failed with status ${response.status}`);
  }
  return (await response.json()) as JobSchedulersResponse;
}

/**
 * Registers a repeatable job. `repeat` holds exactly one of `pattern` or
 * `every`; `jobTemplate` shapes the jobs the scheduler produces.
 */
export async function addJobScheduler(
  queueName: string,
  id: string,
  repeat: JobSchedulerRepeatOptions,
  jobTemplate?: { name?: string; data?: unknown }
): Promise<AppJobScheduler> {
  const body = await mutate(
    `api/queues/${encodeURIComponent(queueName)}/job-schedulers`,
    jsonRequest('POST', { id, repeat, jobTemplate })
  );
  return body?.scheduler as AppJobScheduler;
}

/**
 * Rewrites the schedule of an existing scheduler.
 */
export function updateJobScheduler(
  queueName: string,
  schedulerId: string,
  repeat: JobSchedulerRepeatOptions
): Promise<void> {
  return mutate(
    `api/queues/${encodeURIComponent(queueName)}/job-schedulers/${encodeURIComponent(schedulerId)}`,
    jsonRequest('PATCH', repeat)
  ).then(() => undefined);
}

export function removeJobScheduler(queueName: string, schedulerId: string): Promise<void> {
  return noContentAction(
    `api/queues/${encodeURIComponent(queueName)}/job-schedulers/${encodeURIComponent(schedulerId)}/remove`
  );
}

/**
 * The connected workers of a queue; `null` means the queue could not answer.
 */
export async function fetchQueueWorkers(queueName: string): Promise<QueueWorkersResponse> {
  const response = await fetch(`api/queues/${encodeURIComponent(queueName)}/workers`);
  if (!response.ok) {
    throw new Error(`Workers request failed with status ${response.status}`);
  }
  return (await response.json()) as QueueWorkersResponse;
}

/**
 * The Redis stats of the backing store — memory, version and clients.
 */
export async function fetchRedisStats(): Promise<RedisStats | undefined> {
  const response = await fetch('api/redis/stats');
  if (!response.ok) {
    throw new Error(`Redis stats request failed with status ${response.status}`);
  }
  return (await response.json()) as RedisStats | undefined;
}

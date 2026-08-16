import type { Job, JobSchedulerTemplateOptions } from 'bullmq';
import type { CleanableStatus } from '../constants/statuses';
import type { BaseAdapter } from '../queueAdapters/base';

export type BullBoardQueues = Map<string, BaseAdapter>;

export type QueueJob = Job;

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

export type JobStatus = Exclude<Status, 'latest'>;

/**
 * The statuses `clean` accepts — defined once alongside the validator in
 * `CLEANABLE_STATUSES` so the type can never admit a status the runtime
 * rejects.
 */
export type JobCleanStatus = CleanableStatus;

export type JobCounts = Record<Status, number>;

export type QueueType = 'bull' | 'bullmq';

export type QueueAdapterOptions = {
  readOnlyMode: boolean;
  allowRetries: boolean;
  allowCompletedRetries: boolean;
  prefix: string;
  delimiter: string;
  description: string;
  displayName: string;
};

/**
 * A single worker connection, as reported by Redis `CLIENT LIST`.
 */
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
 * One repeatable job (job scheduler), shaped like bull-board's
 * `AppJobScheduler`. `queueName` is filled by the schedulers endpoint so the
 * list stays cross-queue; the adapter itself never knows it.
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

/**
 * The schedule a scheduler mutation can set — exactly one of `pattern` (cron)
 * or `every` (millisecond interval), plus the optional bounds.
 */
export type JobSchedulerRepeatOptions = {
  pattern?: string;
  every?: number;
  tz?: string;
  limit?: number;
  endDate?: number;
};

export type JobSchedulerTemplate = {
  name?: string;
  data?: unknown;
  opts?: JobSchedulerTemplateOptions;
};

export type JobSchedulerUpdateResult = 'updated' | 'not-found' | 'invalid-schedule';

export type JobSchedulerAddResult = 'created' | 'invalid-schedule' | 'not-supported';

/**
 * Redis/backend info the dashboard can report, shaped like bull-board's
 * `RedisStats`.
 */
export type RedisStats = {
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
};

export interface AppJob {
  id: string | undefined;
  name: string;
  timestamp: number;
  processedOn?: number;
  processedBy?: string;
  finishedOn?: number;
  progress: Job['progress'];
  attempts: number;
  failedReason: string | undefined;
  stacktrace: string[];
  delay: number | undefined;
  opts: Job['opts'];
  data: Job['data'];
  returnValue: Job['returnvalue'];
  isFailed: boolean;
  /**
   * The job's state as the dashboard serves it — present on the per-queue jobs
   * endpoint, absent from the jobs embedded in the queues response.
   */
  state?: JobStatus;
}

export interface QueueJobsResponse {
  jobs: AppJob[];
  pagination: Pagination;
}

/**
 * A single job found by the search endpoints. `queue` is the registered queue
 * name the match was found in — present on both the cross-queue and the
 * per-queue scope so the shape stays uniform.
 */
export interface SearchResult {
  queue: string;
  job: AppJob;
  state: JobStatus;
}

export interface SearchResponse {
  term: string;
  count: number;
  /**
   * The number of jobs examined in this request. A caller deepens the search
   * by passing the accumulated total as the next request's `start`.
   */
  totalScanned: number;
  /**
   * Whether the scan stopped before it could search everything — either the
   * result cap or the per-request scan window was hit. When true, more matches
   * may exist beyond the returned results.
   */
  deepen: boolean;
  results: SearchResult[];
}

export interface JobDetailResponse {
  job: AppJob;
  status: JobStatus | 'unknown';
}

export interface JobLogs {
  logs: string[];
  count: number;
}

/**
 * One job in a flow tree, shaped like bull-board's `FlowNode`. `queueName` is
 * the raw BullMQ queue name the job lives in — flows span queues, so a node's
 * queue can differ from the queue the graph was assembled for.
 */
export interface FlowNode {
  id: string;
  name: string;
  state: JobStatus | 'unknown';
  progress: QueueJob['progress'];
  queueName: string;
  children: FlowNode[];
}

/**
 * The per-job flow tree response, mirroring bull-board's `JobFlow` shape: the
 * requested job's id, whether it is a flow node (its tree root has children),
 * and the whole tree from the flow root when one could be assembled.
 */
export interface JobFlow {
  nodeId: string;
  isFlowNode: boolean;
  flowRoot: FlowNode | null;
}

/**
 * The queue-level flow graph: every root job discovered in the queue's live
 * states, each expanded into its child tree. `nodeCount` is the total number
 * of nodes across the roots (bounded by the flow node cap) and `truncated`
 * says the graph is not the whole pipeline — either more candidates exist
 * beyond the discovery scan window or the node budget ran out.
 */
export interface QueueFlowResponse {
  roots: FlowNode[];
  nodeCount: number;
  truncated: boolean;
}

export interface JobLogsResponse extends JobLogs {
  pagination: Pagination;
}

/**
 * One minute of a queue's historical metrics. `ts` is the minute start;
 * counts are the merged event-derived and native counters; the averages are
 * null until the minute holds samples of that kind.
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

export interface Pagination {
  pageCount: number;
  range: {
    start: number;
    end: number;
  };
}

export interface AppQueue {
  delimiter: string;
  name: string;
  displayName?: string;
  description?: string;
  counts: Record<Status, number>;
  jobs: AppJob[];
  statuses: Status[];
  pagination: Pagination;
  readOnlyMode: boolean;
  allowRetries: boolean;
  allowCompletedRetries: boolean;
  isPaused: boolean;
  type: QueueType;
  globalConcurrency: number | null;
  jobSchedulerCount: number;
  hasWorkers: boolean | null;
}

export type FormatterField = 'data' | 'returnValue' | 'name' | 'progress';

export type AppRouteDefs = {
  entryPoint?: AppViewRoute;
  api: AppControllerRoute[];
};

export type HTTPMethod = 'get' | 'post' | 'put' | 'patch';

export type HTTPStatus = 200 | 201 | 204 | 400 | 403 | 404 | 405 | 409 | 500;

export interface BullBoardRequest {
  queues: BullBoardQueues;
  uiConfig: UIConfig;
  query: Record<string, unknown>;
  params: Record<string, unknown>;
  body: Record<string, unknown>;
  headers: Record<string, string | undefined>;
}

export type ControllerHandlerReturnType = {
  status?: HTTPStatus;
  body: string | Record<string, unknown>;
};

export type ViewHandlerReturnType = {
  name: string;
  params: Record<string, string>;
};

export type Promisify<T> = T | Promise<T>;

export interface AppControllerRoute {
  method: HTTPMethod | HTTPMethod[];
  route: string | string[];
  handler(request?: BullBoardRequest): Promisify<ControllerHandlerReturnType>;
}

export interface AppViewRoute {
  method: HTTPMethod;
  route: string | string[];
  handler(params: { basePath: string; uiConfig: UIConfig }): ViewHandlerReturnType;
}

export interface IServerAdapter {
  setQueues(bullBoardQueues: BullBoardQueues): IServerAdapter;
  setViewsPath(viewPath: string): IServerAdapter;
  setStaticPath(staticsRoute: string, staticsPath: string): IServerAdapter;
  setEntryRoute(route: AppViewRoute): IServerAdapter;
  setErrorHandler(handler: (error: Error) => ControllerHandlerReturnType): IServerAdapter;
  setApiRoutes(routes: AppControllerRoute[]): IServerAdapter;
  setUIConfig(config: UIConfig): IServerAdapter;
}

export type BoardOptions = {
  uiBasePath?: string;
  uiConfig?: UIConfig;
  /**
   * Disables every mutation end to end — the REST contract answers each
   * mutating route with a 403 and the UI hides the action controls.
   */
  readOnly?: boolean;
  /**
   * Historical metrics configuration. Capture is always on for every watched
   * queue; these options only shape the store's keyspace and bucket lifetime.
   */
  metrics?: {
    /** Bucket lifetime in seconds; buckets expire after it. Defaults to 7 days. */
    retentionSeconds?: number;
    /** Keyspace prefix for the store's keys. Defaults to `bullmq-dash:metrics`. */
    prefix?: string;
  };
};

export type IMiscLink = {
  text: string;
  url: string;
};

export type FavIcon = {
  default: string;
  alternative: string;
};

export type DateFormats = {
  short?: Intl.DateTimeFormatOptions;
  common?: Intl.DateTimeFormatOptions;
  full?: Intl.DateTimeFormatOptions;
};

export type UIConfig = Partial<{
  boardTitle: string;
  /**
   * The board-level `readOnly` option on `createBullBoard`. Core-owned: the
   * board's own value always wins over anything a caller puts in `uiConfig`.
   */
  readOnly: boolean;
  boardLogo: { path: string; width?: number | string; height?: number | string };
  miscLinks: IMiscLink[];
  hideDocsLink: boolean;
  queueSortOptions: { key: string; label: string }[];
  favIcon: FavIcon;
  locale: { lng?: string };
  dateFormats?: DateFormats;
  pollingInterval?: Partial<{ showSetting: boolean; forceInterval: number }>;
  menu?: { width?: string };
  overview?: { groupByDelimiter?: boolean };
  sortQueues?: boolean;
  hideRedisDetails?: boolean;
  showMetrics?: boolean;
  showWorkers?: boolean;
  hasHistoryProvider?: boolean;
  hasHistoryUsage?: boolean;
  canPurgeHistory?: boolean;
  hasLatencyHistory?: boolean;
  environment?: {
    label: string;
    color: string;
    textColor?: string;
    fontSize?: string | number;
  };
}>;

import type { Job } from 'bullmq';
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

export interface AppJob {
  id: string | undefined;
  name: string;
  timestamp: number;
  processedOn?: number;
  processedBy?: string;
  finishedOn?: number;
  progress: Job['progress'];
  attempts: number;
  failedReason: string;
  stacktrace: string[];
  delay: number | undefined;
  opts: Job['opts'];
  data: Job['data'];
  returnValue: Job['returnvalue'];
  isFailed: boolean;
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

export type HTTPStatus = 200 | 204 | 400 | 403 | 404 | 405 | 409 | 500;

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

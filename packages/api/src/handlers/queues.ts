import type { BaseAdapter } from '../queueAdapters/base';
import type {
  AppJob,
  AppQueue,
  BullBoardRequest,
  ControllerHandlerReturnType,
  JobCounts,
  JobStatus,
  Pagination,
  QueueJob,
  Status,
} from '../typings/app';
import { pageRange, stringValue } from './query';

export const formatJob = (job: QueueJob, queue: BaseAdapter): AppJob => {
  const jobProps = job.toJSON();

  const stacktrace = jobProps.stacktrace ? jobProps.stacktrace.filter(Boolean) : [];
  stacktrace.reverse();

  return {
    id: jobProps.id,
    timestamp: jobProps.timestamp,
    ...(jobProps.processedOn !== undefined ? { processedOn: jobProps.processedOn } : {}),
    ...(jobProps.processedBy !== undefined ? { processedBy: jobProps.processedBy } : {}),
    ...(jobProps.finishedOn !== undefined ? { finishedOn: jobProps.finishedOn } : {}),
    progress: queue.format('progress', jobProps.progress) as QueueJob['progress'],
    attempts: jobProps.attemptsMade,
    delay: jobProps.delay,
    failedReason: jobProps.failedReason,
    stacktrace,
    opts: jobProps.opts,
    data: queue.format('data', jobProps.data),
    name: queue.format('name', jobProps, jobProps.name || '') as string,
    returnValue: queue.format('returnValue', jobProps.returnvalue),
    isFailed: !!jobProps.failedReason || (Array.isArray(stacktrace) && stacktrace.length > 0),
  };
};

function getPagination(
  statuses: JobStatus[],
  counts: JobCounts,
  currentPage: number,
  jobsPerPage: number,
  isLatestView: boolean
): Pagination {
  const [firstStatus] = statuses;
  const total = isLatestView
    ? statuses.reduce((total, status) => total + Math.min(counts[status] ?? 0, jobsPerPage), 0)
    : firstStatus
      ? (counts[firstStatus] ?? 0)
      : 0;

  const pageCount = isLatestView ? 1 : Math.ceil(total / jobsPerPage);

  return {
    pageCount,
    range: pageRange(isLatestView ? 1 : currentPage, jobsPerPage),
  };
}

async function getHasWorkers(queue: BaseAdapter, showWorkers: boolean): Promise<boolean | null> {
  if (!showWorkers) {
    return null;
  }

  const workers = await queue.getWorkers().catch(() => null);
  if (!workers) {
    return null;
  }
  return workers.length > 0;
}

type QueueQuery = {
  activeQueue: string;
  jobsPerPage: number;
  status: string | undefined;
  page: number;
};

function parseQueueQuery(query: Record<string, unknown>): QueueQuery {
  const activeQueue = stringValue(query, 'activeQueue');

  return {
    activeQueue: activeQueue === undefined ? '' : decodeURIComponent(activeQueue),
    jobsPerPage: Number(stringValue(query, 'jobsPerPage')) || 10,
    status: stringValue(query, 'status'),
    page: Number(stringValue(query, 'page')) || 1,
  };
}

async function getAppQueues(
  pairs: [string, BaseAdapter][],
  query: Record<string, unknown>,
  showWorkers: boolean
): Promise<AppQueue[]> {
  const { activeQueue, jobsPerPage, status: statusQuery, page: currentPage } =
    parseQueueQuery(query);

  return Promise.all(
    pairs.map(async ([queueName, queue]) => {
      const isActiveQueue = activeQueue !== '' && activeQueue === queueName;

      const jobStatuses = queue.getJobStatuses();

      const isLatestView = !isActiveQueue || !statusQuery || statusQuery === 'latest';
      const status: JobStatus[] = isLatestView ? jobStatuses : [statusQuery as JobStatus];

      const counts = await queue.getJobCounts();
      const isPaused = await queue.isPaused();
      const globalConcurrency = await queue.getGlobalConcurrency();
      const jobSchedulerCount = await queue.getJobSchedulersCount();
      const hasWorkers = await getHasWorkers(queue, showWorkers);

      const pagination = getPagination(status, counts, currentPage, jobsPerPage, isLatestView);
      const jobs = isActiveQueue
        ? await queue.getJobs(status, pagination.range.start, pagination.range.end)
        : [];

      return {
        name: queueName,
        ...(queue.getDisplayName() ? { displayName: queue.getDisplayName() } : {}),
        ...(queue.getDescription() ? { description: queue.getDescription() } : {}),
        statuses: queue.getStatuses(),
        counts: counts as Record<Status, number>,
        jobs: jobs.filter(Boolean).map((job) => formatJob(job, queue)),
        pagination,
        readOnlyMode: queue.readOnlyMode,
        allowRetries: queue.allowRetries,
        allowCompletedRetries: queue.allowCompletedRetries,
        isPaused,
        type: queue.type,
        delimiter: queue.delimiter,
        globalConcurrency,
        jobSchedulerCount,
        hasWorkers,
      };
    })
  );
}

export async function queuesHandler(req: BullBoardRequest): Promise<ControllerHandlerReturnType> {
  const pairs: [string, BaseAdapter][] = [];

  for (const [queueName, queue] of req.queues.entries()) {
    if (await queue.isVisible(req)) {
      pairs.push([queueName, queue]);
    }
  }

  const queues =
    pairs.length > 0 ? await getAppQueues(pairs, req.query, req.uiConfig?.showWorkers !== false) : [];

  return {
    body: {
      queues,
    },
  };
}

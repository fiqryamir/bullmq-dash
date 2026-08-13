import type {
  BullBoardRequest,
  ControllerHandlerReturnType,
  JobStatus,
  QueueJobsResponse,
} from '../typings/app';
import { formatJob } from './queues';
import { pageRange, stringValue } from './query';

type JobsQuery = {
  status: JobStatus | undefined;
  page: number;
  jobsPerPage: number;
};

function parseJobsQuery(query: Record<string, unknown>): JobsQuery {
  const page = Number(stringValue(query, 'page'));
  const jobsPerPage = Number(stringValue(query, 'jobsPerPage'));

  return {
    status: stringValue(query, 'status') as JobStatus | undefined,
    page: Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1,
    jobsPerPage: Number.isFinite(jobsPerPage) ? Math.max(1, Math.floor(jobsPerPage)) : 10,
  };
}

export async function queueJobsHandler(
  req: BullBoardRequest
): Promise<ControllerHandlerReturnType> {
  const rawQueueName = req.params.queueName;
  const queueName = typeof rawQueueName === 'string' ? decodeURIComponent(rawQueueName) : '';
  const queue = req.queues.get(queueName);

  if (!queue || !(await queue.isVisible(req))) {
    return { status: 404, body: { error: 'Queue not found' } };
  }

  const { status, page, jobsPerPage } = parseJobsQuery(req.query);

  if (!status || !queue.getJobStatuses().includes(status)) {
    return { status: 400, body: { error: 'Invalid status' } };
  }

  const total = await queue.getJobCountForStatus(status);
  const pagination = {
    pageCount: Math.ceil(total / jobsPerPage),
    range: pageRange(page, jobsPerPage),
  };

  const jobs = await queue.getJobs([status], pagination.range.start, pagination.range.end);

  return {
    body: {
      jobs: jobs.map((job) => ({ ...formatJob(job, queue), state: status })),
      pagination,
    } satisfies QueueJobsResponse,
  };
}

import type {
  BullBoardRequest,
  ControllerHandlerReturnType,
  JobStatus,
  Pagination,
  QueueJobsResponse,
} from '../typings/app';
import { formatJob } from './queues';

type JobsQuery = {
  status: JobStatus | undefined;
  page: number;
  jobsPerPage: number;
};

function parseJobsQuery(query: Record<string, unknown>): JobsQuery {
  const stringValue = (key: string): string | undefined =>
    typeof query[key] === 'string' ? (query[key] as string) : undefined;

  const page = Number(stringValue('page'));
  const jobsPerPage = Number(stringValue('jobsPerPage'));

  return {
    status: stringValue('status') as JobStatus | undefined,
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
  const start = (page - 1) * jobsPerPage;
  const pagination: Pagination = {
    pageCount: Math.ceil(total / jobsPerPage),
    range: { start, end: start + jobsPerPage - 1 },
  };

  const jobs = await queue.getJobs([status], pagination.range.start, pagination.range.end);

  return {
    body: {
      jobs: jobs.map((job) => ({ ...formatJob(job, queue), state: status })),
      pagination,
    } satisfies QueueJobsResponse,
  };
}

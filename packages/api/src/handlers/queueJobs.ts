import type {
  BullBoardRequest,
  ControllerHandlerReturnType,
  JobStatus,
  QueueJobsResponse,
} from '../typings/app';
import { formatJob } from './queues';
import { pageRange, parsePageQuery, stringValue } from './query';
import { resolveQueue } from './helpers';

const JOBS_PER_PAGE = 10;

export async function queueJobsHandler(
  req: BullBoardRequest
): Promise<ControllerHandlerReturnType> {
  const queue = await resolveQueue(req);

  if (!queue) {
    return { status: 404, body: { error: 'Queue not found' } };
  }

  const status = stringValue(req.query, 'status') as JobStatus | undefined;
  const { page, pageSize } = parsePageQuery(req.query, 'jobsPerPage', JOBS_PER_PAGE);

  if (!status || !queue.getJobStatuses().includes(status)) {
    return { status: 400, body: { error: 'Invalid status' } };
  }

  const total = await queue.getJobCountForStatus(status);
  const pagination = {
    pageCount: Math.ceil(total / pageSize),
    range: pageRange(page, pageSize),
  };

  const jobs = await queue.getJobs([status], pagination.range.start, pagination.range.end);

  return {
    body: {
      jobs: jobs.map((job) => ({ ...formatJob(job, queue), state: status })),
      pagination,
    } satisfies QueueJobsResponse,
  };
}

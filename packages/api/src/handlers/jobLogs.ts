import type {
  BullBoardRequest,
  ControllerHandlerReturnType,
  JobLogsResponse,
} from '../typings/app';
import { paramValue, resolveQueue } from './helpers';
import { pageRange, parsePageQuery } from './query';

const LOGS_PER_PAGE = 10;

export async function jobLogsHandler(req: BullBoardRequest): Promise<ControllerHandlerReturnType> {
  const queue = await resolveQueue(req);

  if (!queue) {
    return { status: 404, body: { error: 'Queue not found' } };
  }

  const jobId = paramValue(req, 'jobId');

  if (!(await queue.getJob(jobId))) {
    return { status: 404, body: { error: 'Job not found' } };
  }

  const { page, pageSize } = parsePageQuery(req.query, 'logsPerPage', LOGS_PER_PAGE);
  const range = pageRange(page, pageSize);
  const { logs, count } = await queue.getJobLogs(jobId, range.start, range.end);

  return {
    body: {
      logs,
      count,
      pagination: { pageCount: Math.ceil(count / pageSize), range },
    } satisfies JobLogsResponse,
  };
}

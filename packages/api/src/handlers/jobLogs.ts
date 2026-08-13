import type {
  BullBoardRequest,
  ControllerHandlerReturnType,
  JobLogsResponse,
} from '../typings/app';
import { pageRange, stringValue } from './query';

const LOGS_PER_PAGE = 10;

type LogsQuery = {
  page: number;
  logsPerPage: number;
};

function parseLogsQuery(query: Record<string, unknown>): LogsQuery {
  const page = Number(stringValue(query, 'page'));
  const logsPerPage = Number(stringValue(query, 'logsPerPage'));

  return {
    page: Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1,
    logsPerPage: Number.isFinite(logsPerPage) ? Math.max(1, Math.floor(logsPerPage)) : LOGS_PER_PAGE,
  };
}

export async function jobLogsHandler(req: BullBoardRequest): Promise<ControllerHandlerReturnType> {
  const rawQueueName = req.params.queueName;
  const queueName = typeof rawQueueName === 'string' ? decodeURIComponent(rawQueueName) : '';
  const queue = req.queues.get(queueName);

  if (!queue || !(await queue.isVisible(req))) {
    return { status: 404, body: { error: 'Queue not found' } };
  }

  const rawJobId = req.params.jobId;
  const jobId = typeof rawJobId === 'string' ? decodeURIComponent(rawJobId) : '';

  if (!(await queue.getJob(jobId))) {
    return { status: 404, body: { error: 'Job not found' } };
  }

  const { page, logsPerPage } = parseLogsQuery(req.query);
  const range = pageRange(page, logsPerPage);
  const { logs, count } = await queue.getJobLogs(jobId, range.start, range.end);

  return {
    body: {
      logs,
      count,
      pagination: { pageCount: Math.ceil(count / logsPerPage), range },
    } satisfies JobLogsResponse,
  };
}

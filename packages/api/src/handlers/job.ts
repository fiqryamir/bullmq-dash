import type {
  BullBoardRequest,
  ControllerHandlerReturnType,
  JobDetailResponse,
  JobStatus,
} from '../typings/app';
import { paramValue, resolveQueue } from './helpers';
import { formatJob } from './queues';

export async function jobHandler(req: BullBoardRequest): Promise<ControllerHandlerReturnType> {
  const queue = await resolveQueue(req);

  if (!queue) {
    return { status: 404, body: { error: 'Queue not found' } };
  }

  const job = await queue.getJob(paramValue(req, 'jobId'));

  if (!job) {
    return { status: 404, body: { error: 'Job not found' } };
  }

  const status = (await job.getState()) as JobStatus | 'unknown';

  return {
    body: { job: formatJob(job, queue), status } satisfies JobDetailResponse,
  };
}

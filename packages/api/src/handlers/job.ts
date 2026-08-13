import type {
  BullBoardRequest,
  ControllerHandlerReturnType,
  JobDetailResponse,
  JobStatus,
} from '../typings/app';
import { formatJob } from './queues';

export async function jobHandler(req: BullBoardRequest): Promise<ControllerHandlerReturnType> {
  const rawQueueName = req.params.queueName;
  const queueName = typeof rawQueueName === 'string' ? decodeURIComponent(rawQueueName) : '';
  const queue = req.queues.get(queueName);

  if (!queue || !(await queue.isVisible(req))) {
    return { status: 404, body: { error: 'Queue not found' } };
  }

  const rawJobId = req.params.jobId;
  const jobId = typeof rawJobId === 'string' ? decodeURIComponent(rawJobId) : '';
  const job = await queue.getJob(jobId);

  if (!job) {
    return { status: 404, body: { error: 'Job not found' } };
  }

  const status = (await job.getState()) as JobStatus | 'unknown';

  return {
    body: { job: formatJob(job, queue), status } satisfies JobDetailResponse,
  };
}

import { isCleanableStatus, isJobStatus, isRetriableStatus } from '../constants/statuses';
import type { BullBoardRequest, ControllerHandlerReturnType } from '../typings/app';
import { mutationQueue, paramValue } from './helpers';
import { stringValue } from './query';

const DEFAULT_GRACE_SECONDS = 5;

export async function retryAllHandler(
  req: BullBoardRequest
): Promise<ControllerHandlerReturnType> {
  const result = await mutationQueue(req);

  if (!('queue' in result)) {
    return result;
  }

  const queue = result.queue;
  const queueStatus = paramValue(req, 'queueStatus');

  if (!isRetriableStatus(queueStatus)) {
    return { status: 400, body: { error: 'Invalid retry status' } };
  }

  // Counted first so a job finishing mid-request understates the gap rather
  // than inventing one; a retry that races a worker also lands in skipped.
  const counts = await queue.getJobCounts();
  const jobs = await queue.getJobs([queueStatus]);
  const results = await Promise.allSettled(jobs.map((job) => job.retry(queueStatus)));
  const retried = results.filter((result) => result.status === 'fulfilled').length;

  return {
    body: {
      retried,
      skipped: Math.max(0, (counts[queueStatus] ?? 0) - retried),
    },
  };
}

export async function promoteAllHandler(
  req: BullBoardRequest
): Promise<ControllerHandlerReturnType> {
  const result = await mutationQueue(req);

  if (!('queue' in result)) {
    return result;
  }

  await result.queue.promoteAll();

  return { body: {} };
}

export async function cleanAllHandler(
  req: BullBoardRequest
): Promise<ControllerHandlerReturnType> {
  const result = await mutationQueue(req);

  if (!('queue' in result)) {
    return result;
  }

  const queueStatus = paramValue(req, 'queueStatus');

  if (!isCleanableStatus(queueStatus)) {
    return { status: 400, body: { error: 'Invalid clean status' } };
  }

  const rawGrace = stringValue(req.query, 'grace');
  const graceSeconds = rawGrace === undefined ? DEFAULT_GRACE_SECONDS : Number(rawGrace);

  if (!Number.isFinite(graceSeconds) || graceSeconds < 0) {
    return { status: 400, body: { error: 'Invalid grace period' } };
  }

  await result.queue.clean(queueStatus, Math.round(graceSeconds * 1000));

  return { body: {} };
}

export async function removeAllHandler(
  req: BullBoardRequest
): Promise<ControllerHandlerReturnType> {
  const result = await mutationQueue(req);

  if (!('queue' in result)) {
    return result;
  }

  const queueStatus = paramValue(req, 'queueStatus');

  if (!isJobStatus(queueStatus) || !result.queue.getJobStatuses().includes(queueStatus)) {
    return { status: 400, body: { error: 'Invalid status' } };
  }

  const jobs = await result.queue.getJobs([queueStatus]);
  const results = await Promise.allSettled(jobs.map((job) => job.remove()));
  const removed = results.filter((result) => result.status === 'fulfilled').length;

  return {
    body: {
      removed,
    },
  };
}

export async function pauseQueueHandler(
  req: BullBoardRequest
): Promise<ControllerHandlerReturnType> {
  const result = await mutationQueue(req);

  if (!('queue' in result)) {
    return result;
  }

  await result.queue.pause();

  return { body: {} };
}

export async function resumeQueueHandler(
  req: BullBoardRequest
): Promise<ControllerHandlerReturnType> {
  const result = await mutationQueue(req);

  if (!('queue' in result)) {
    return result;
  }

  await result.queue.resume();

  return { body: {} };
}

export async function emptyQueueHandler(
  req: BullBoardRequest
): Promise<ControllerHandlerReturnType> {
  const result = await mutationQueue(req);

  if (!('queue' in result)) {
    return result;
  }

  await result.queue.empty();

  return { body: {} };
}

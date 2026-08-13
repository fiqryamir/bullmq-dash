import { STATUSES } from '../constants/statuses';
import type { BullBoardRequest, ControllerHandlerReturnType, JobStatus } from '../typings/app';
import { isReadOnlyQueue, paramValue, readOnlyError, resolveQueue } from './helpers';
import { stringValue } from './query';

const RETRIABLE_STATUSES = [STATUSES.failed, STATUSES.completed] as const;

/**
 * The statuses BullMQ's `queue.clean` accepts, mapped onto the dashboard's
 * status names. `paused` is a presentation-only state here (v6 stores paused
 * jobs as waiting) and `waiting-children` is not a clean type.
 */
const CLEANABLE_STATUSES = [
  STATUSES.completed,
  STATUSES.failed,
  STATUSES.delayed,
  STATUSES.waiting,
  STATUSES.active,
  STATUSES.prioritized,
] as const;

const DEFAULT_GRACE_SECONDS = 5;

type RetriableStatus = (typeof RETRIABLE_STATUSES)[number];

function isRetriableStatus(status: string): status is RetriableStatus {
  return (RETRIABLE_STATUSES as readonly string[]).includes(status);
}

function isCleanableStatus(status: string): status is (typeof CLEANABLE_STATUSES)[number] {
  return (CLEANABLE_STATUSES as readonly string[]).includes(status);
}

export async function retryAllHandler(
  req: BullBoardRequest
): Promise<ControllerHandlerReturnType> {
  const queue = await resolveQueue(req);

  if (!queue) {
    return { status: 404, body: { error: 'Queue not found' } };
  }

  if (await isReadOnlyQueue(req, queue)) {
    return readOnlyError();
  }

  const queueStatus = paramValue(req, 'queueStatus');

  if (!isRetriableStatus(queueStatus)) {
    return { status: 400, body: { error: 'Invalid retry status' } };
  }

  // Counted first so a job finishing mid-request understates the gap rather than inventing one.
  const counts = await queue.getJobCounts();
  const jobs = await queue.getJobs([queueStatus]);
  await Promise.all(jobs.map((job) => job.retry(queueStatus)));

  return {
    body: {
      retried: jobs.length,
      skipped: Math.max(0, (counts[queueStatus] ?? 0) - jobs.length),
    },
  };
}

export async function promoteAllHandler(
  req: BullBoardRequest
): Promise<ControllerHandlerReturnType> {
  const queue = await resolveQueue(req);

  if (!queue) {
    return { status: 404, body: { error: 'Queue not found' } };
  }

  if (await isReadOnlyQueue(req, queue)) {
    return readOnlyError();
  }

  await queue.promoteAll();

  return { body: {} };
}

export async function cleanAllHandler(
  req: BullBoardRequest
): Promise<ControllerHandlerReturnType> {
  const queue = await resolveQueue(req);

  if (!queue) {
    return { status: 404, body: { error: 'Queue not found' } };
  }

  if (await isReadOnlyQueue(req, queue)) {
    return readOnlyError();
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

  await queue.clean(queueStatus, Math.round(graceSeconds * 1000));

  return { body: {} };
}

export async function removeAllHandler(
  req: BullBoardRequest
): Promise<ControllerHandlerReturnType> {
  const queue = await resolveQueue(req);

  if (!queue) {
    return { status: 404, body: { error: 'Queue not found' } };
  }

  if (await isReadOnlyQueue(req, queue)) {
    return readOnlyError();
  }

  const queueStatus = paramValue(req, 'queueStatus') as JobStatus;

  if (!queue.getJobStatuses().includes(queueStatus)) {
    return { status: 400, body: { error: 'Invalid status' } };
  }

  const jobs = await queue.getJobs([queueStatus]);
  await Promise.all(jobs.map((job) => job.remove()));

  return {
    body: {
      removed: jobs.length,
    },
  };
}

export async function pauseQueueHandler(
  req: BullBoardRequest
): Promise<ControllerHandlerReturnType> {
  const queue = await resolveQueue(req);

  if (!queue) {
    return { status: 404, body: { error: 'Queue not found' } };
  }

  if (await isReadOnlyQueue(req, queue)) {
    return readOnlyError();
  }

  await queue.pause();

  return { body: {} };
}

export async function resumeQueueHandler(
  req: BullBoardRequest
): Promise<ControllerHandlerReturnType> {
  const queue = await resolveQueue(req);

  if (!queue) {
    return { status: 404, body: { error: 'Queue not found' } };
  }

  if (await isReadOnlyQueue(req, queue)) {
    return readOnlyError();
  }

  await queue.resume();

  return { body: {} };
}

export async function emptyQueueHandler(
  req: BullBoardRequest
): Promise<ControllerHandlerReturnType> {
  const queue = await resolveQueue(req);

  if (!queue) {
    return { status: 404, body: { error: 'Queue not found' } };
  }

  if (await isReadOnlyQueue(req, queue)) {
    return readOnlyError();
  }

  await queue.empty();

  return { body: {} };
}

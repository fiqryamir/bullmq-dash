import type {
  BullBoardRequest,
  ControllerHandlerReturnType,
  JobStatus,
} from '../typings/app';
import { isReadOnlyQueue, paramValue, readOnlyError, resolveQueue } from './helpers';

type RetriableState = Extract<JobStatus, 'failed' | 'completed'>;

function isRetriableState(state: string): state is RetriableState {
  return state === 'failed' || state === 'completed';
}

export async function retryJobHandler(
  req: BullBoardRequest
): Promise<ControllerHandlerReturnType> {
  const queue = await resolveQueue(req);

  if (!queue) {
    return { status: 404, body: { error: 'Queue not found' } };
  }

  if (await isReadOnlyQueue(req, queue)) {
    return readOnlyError();
  }

  const job = await queue.getJob(paramValue(req, 'jobId'));

  if (!job) {
    return { status: 404, body: { error: 'Job not found' } };
  }

  const state = await job.getState();

  if (!isRetriableState(state)) {
    return { status: 400, body: { error: 'Job is not retriable' } };
  }

  await job.retry(state);

  return { status: 204, body: {} };
}

export async function promoteJobHandler(
  req: BullBoardRequest
): Promise<ControllerHandlerReturnType> {
  const queue = await resolveQueue(req);

  if (!queue) {
    return { status: 404, body: { error: 'Queue not found' } };
  }

  if (await isReadOnlyQueue(req, queue)) {
    return readOnlyError();
  }

  const job = await queue.getJob(paramValue(req, 'jobId'));

  if (!job) {
    return { status: 404, body: { error: 'Job not found' } };
  }

  await job.promote();

  return { status: 204, body: {} };
}

export async function removeJobHandler(
  req: BullBoardRequest
): Promise<ControllerHandlerReturnType> {
  const queue = await resolveQueue(req);

  if (!queue) {
    return { status: 404, body: { error: 'Queue not found' } };
  }

  if (await isReadOnlyQueue(req, queue)) {
    return readOnlyError();
  }

  const job = await queue.getJob(paramValue(req, 'jobId'));

  if (!job) {
    return { status: 404, body: { error: 'Job not found' } };
  }

  try {
    await job.remove();
  } catch (error) {
    // A job held by a worker cannot be removed; its state separates this
    // transient conflict from an actual server fault.
    if ((await job.getState().catch(() => null)) === 'active') {
      return { status: 409, body: { error: 'Job is active' } };
    }

    throw error;
  }

  return { status: 204, body: {} };
}

import type { JobSchedulerTemplateOptions } from 'bullmq';
import type { BaseAdapter } from '../queueAdapters/base';
import type {
  BullBoardRequest,
  ControllerHandlerReturnType,
  JobSchedulerRepeatOptions,
  JobSchedulerTemplate,
} from '../typings/app';
import { mutationQueue, paramValue } from './helpers';

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

type RepeatParseResult =
  | { repeat: JobSchedulerRepeatOptions }
  | { error: ControllerHandlerReturnType };

/**
 * The shared schedule validation: exactly one of `pattern` (non-empty cron)
 * or `every` (positive milliseconds), plus optional tz, integer limit and
 * future end date.
 */
export function parseRepeat(body: Record<string, unknown>): RepeatParseResult {
  const { pattern, every, tz, limit, endDate } = body;

  const hasPattern = typeof pattern === 'string' && pattern.trim().length > 0;
  const hasEvery = every !== undefined && every !== null;

  if (hasPattern === hasEvery) {
    return { error: { status: 400, body: { error: 'Exactly one of pattern or every is required' } } };
  }

  if (hasEvery && !isPositiveNumber(every)) {
    return { error: { status: 400, body: { error: 'every must be a positive number' } } };
  }

  if (limit !== undefined && limit !== null && (!isPositiveNumber(limit) || !Number.isInteger(limit))) {
    return { error: { status: 400, body: { error: 'limit must be a positive integer' } } };
  }

  if (endDate !== undefined && endDate !== null) {
    if (!isPositiveNumber(endDate) || endDate <= Date.now()) {
      return { error: { status: 400, body: { error: 'endDate must be in the future' } } };
    }
  }

  if (tz !== undefined && tz !== null && (typeof tz !== 'string' || tz.trim().length === 0)) {
    return { error: { status: 400, body: { error: 'tz must be a non-empty string' } } };
  }

  return {
    repeat: {
      ...(hasPattern ? { pattern: (pattern as string).trim() } : { every: every as number }),
      ...(typeof tz === 'string' && tz.trim().length > 0 ? { tz: tz.trim() } : {}),
      ...(limit !== undefined && limit !== null ? { limit: limit as number } : {}),
      ...(endDate !== undefined && endDate !== null ? { endDate: endDate as number } : {}),
    },
  };
}

function parseTemplate(body: Record<string, unknown>): JobSchedulerTemplate | undefined {
  const jobTemplate = body.jobTemplate;
  if (!jobTemplate || typeof jobTemplate !== 'object') {
    return undefined;
  }

  const raw = jobTemplate as Record<string, unknown>;
  const template: JobSchedulerTemplate = {};
  if (typeof raw.name === 'string' && raw.name.trim().length > 0) {
    template.name = raw.name.trim();
  }
  if (raw.data !== undefined) {
    template.data = raw.data;
  }
  if (raw.opts && typeof raw.opts === 'object') {
    template.opts = raw.opts as JobSchedulerTemplateOptions;
  }
  return template;
}

function invalidScheduleError(): ControllerHandlerReturnType {
  return { status: 400, body: { error: 'Invalid scheduler schedule' } };
}

export async function addJobSchedulerHandler(
  req: BullBoardRequest
): Promise<ControllerHandlerReturnType> {
  const result = await mutationQueue(req);

  if (!('queue' in result)) {
    return result;
  }

  const rawId = req.body.id;
  const id = typeof rawId === 'string' ? rawId.trim() : '';
  if (id.length === 0) {
    return { status: 400, body: { error: 'A scheduler id is required' } };
  }

  const rawRepeat = req.body.repeat;
  const parsed = parseRepeat(
    rawRepeat && typeof rawRepeat === 'object' ? (rawRepeat as Record<string, unknown>) : {}
  );
  if ('error' in parsed) {
    return parsed.error;
  }

  const addResult = await result.queue.addJobScheduler(id, parsed.repeat, parseTemplate(req.body));

  if (addResult === 'not-supported') {
    return { status: 405, body: { error: 'Scheduler creation is not supported for this queue' } };
  }

  if (addResult === 'invalid-schedule') {
    return invalidScheduleError();
  }

  const scheduler = await findScheduler(result.queue, id);
  if (!scheduler) {
    return { status: 404, body: { error: 'Scheduler not found' } };
  }

  return {
    status: 201,
    body: { scheduler },
  };
}

export async function updateJobSchedulerHandler(
  req: BullBoardRequest
): Promise<ControllerHandlerReturnType> {
  const result = await mutationQueue(req);

  if (!('queue' in result)) {
    return result;
  }

  if (!result.queue.supportsJobSchedulerUpdate) {
    return { status: 405, body: { error: 'Scheduler updates are not supported for this queue' } };
  }

  const parsed = parseRepeat(req.body);
  if ('error' in parsed) {
    return parsed.error;
  }

  const updateResult = await result.queue.updateJobScheduler(paramValue(req, 'schedulerId'), parsed.repeat);

  if (updateResult === 'not-found') {
    return { status: 404, body: { error: 'Scheduler not found' } };
  }

  if (updateResult === 'invalid-schedule') {
    return invalidScheduleError();
  }

  return {
    status: 204,
    body: {},
  };
}

export async function removeJobSchedulerHandler(
  req: BullBoardRequest
): Promise<ControllerHandlerReturnType> {
  const result = await mutationQueue(req);

  if (!('queue' in result)) {
    return result;
  }

  const removed = await result.queue.removeJobScheduler(paramValue(req, 'schedulerId'));

  if (!removed) {
    return { status: 404, body: { error: 'Scheduler not found' } };
  }

  return {
    status: 204,
    body: {},
  };
}

async function findScheduler(queue: BaseAdapter, id: string) {
  const schedulers = await queue.getJobSchedulers();
  return schedulers.find((scheduler) => scheduler.id === id);
}

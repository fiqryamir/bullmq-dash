import type { BaseAdapter } from '../queueAdapters/base';
import type { BullBoardRequest } from '../typings/app';

export function paramValue(req: BullBoardRequest, key: string): string {
  const raw = req.params[key];
  return typeof raw === 'string' ? decodeURIComponent(raw) : '';
}

/**
 * The registered queue named in the request's `queueName` param, or `null`
 * when it is unregistered or hidden by its visibility guard.
 */
export async function resolveQueue(req: BullBoardRequest): Promise<BaseAdapter | null> {
  const queue = req.queues.get(paramValue(req, 'queueName'));
  return queue && (await queue.isVisible(req)) ? queue : null;
}

import type { BullBoardRequest, ControllerHandlerReturnType } from '../typings/app';
import { resolveQueue } from './helpers';

/**
 * The full worker list for one queue. `null` keeps "could not ask" distinct
 * from "asked, nobody is there", so an unreachable queue leaves the section
 * out instead of claiming its workers are gone.
 */
export async function queueWorkersHandler(
  req: BullBoardRequest
): Promise<ControllerHandlerReturnType> {
  const queue = await resolveQueue(req);

  if (!queue) {
    return { status: 404, body: { error: 'Queue not found' } };
  }

  if (req.uiConfig.showWorkers === false) {
    return { status: 403, body: { error: 'Workers view is disabled' } };
  }

  const workers = await queue.getWorkers().catch(() => null);

  return { status: 200, body: { workers } };
}

import type { BaseAdapter } from '../queueAdapters/base';
import type { AppJobScheduler, BullBoardRequest, ControllerHandlerReturnType } from '../typings/app';

async function visibleQueues(req: BullBoardRequest): Promise<[string, BaseAdapter][]> {
  const requested = req.query?.queueName;
  const pairs: [string, BaseAdapter][] = [];

  for (const [queueName, queue] of req.queues.entries()) {
    if (requested !== undefined && decodeURIComponent(String(requested)) !== queueName) {
      continue;
    }

    if (await queue.isVisible(req)) {
      pairs.push([queueName, queue]);
    }
  }

  return pairs;
}

/**
 * Every scheduler the board can see, tagged with the queue it belongs to.
 * A `queueName` query scopes the list to one queue.
 */
export async function jobSchedulersHandler(
  req: BullBoardRequest
): Promise<ControllerHandlerReturnType> {
  const pairs = await visibleQueues(req);

  const perQueue = await Promise.all(
    pairs.map(async ([queueName, queue]): Promise<AppJobScheduler[]> => {
      const schedulers = await queue.getJobSchedulers();

      return schedulers.map((scheduler) => ({ ...scheduler, queueName }));
    })
  );

  return {
    body: {
      schedulers: perQueue.flat(),
    },
  };
}

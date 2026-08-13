import type { BaseAdapter } from './queueAdapters/base';
import type { BullBoardQueues } from './typings/app';

export function getQueuesApi(queues: ReadonlyArray<BaseAdapter>) {
  const bullBoardQueues: BullBoardQueues = new Map<string, BaseAdapter>();

  function addQueue(queue: BaseAdapter): void {
    bullBoardQueues.set(queue.getName(), queue);
  }

  function removeQueue(queueOrName: string | BaseAdapter): void {
    const name = typeof queueOrName === 'string' ? queueOrName : queueOrName.getName();
    bullBoardQueues.delete(name);
  }

  function setQueues(newBullQueues: ReadonlyArray<BaseAdapter>): void {
    newBullQueues.forEach((queue) => bullBoardQueues.set(queue.getName(), queue));
  }

  function replaceQueues(newBullQueues: ReadonlyArray<BaseAdapter>): void {
    const queuesToPersist = newBullQueues.map((queue) => queue.getName());
    bullBoardQueues.forEach((_queue, name) => {
      if (queuesToPersist.indexOf(name) === -1) {
        bullBoardQueues.delete(name);
      }
    });
    return setQueues(newBullQueues);
  }

  setQueues(queues);

  return { bullBoardQueues, setQueues, replaceQueues, addQueue, removeQueue };
}

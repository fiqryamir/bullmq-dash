import { errorHandler } from './handlers/error';
import type { BaseAdapter } from './queueAdapters/base';
import { getQueuesApi } from './queuesApi';
import { appRoutes } from './routes';
import type { BoardOptions, IServerAdapter } from './typings/app';

export { BaseAdapter } from './queueAdapters/base';
export { BullMQAdapter } from './queueAdapters/bullMQ';
export * from './typings/app';

type CreateBullBoardArgs = {
  queues: ReadonlyArray<BaseAdapter>;
  serverAdapter: IServerAdapter;
  options?: BoardOptions;
};

export function createBullBoard({ queues, serverAdapter, options }: CreateBullBoardArgs) {
  const { bullBoardQueues, setQueues, replaceQueues, addQueue, removeQueue } = getQueuesApi(queues);

  serverAdapter
    .setQueues(bullBoardQueues)
    .setUIConfig({
      boardTitle: 'Bull Dashboard',
      favIcon: {
        default: 'static/images/logo.svg',
        alternative: 'static/favicon-32x32.png',
      },
      ...options?.uiConfig,
    })
    .setErrorHandler(errorHandler)
    .setApiRoutes(appRoutes.api);

  return { setQueues, replaceQueues, addQueue, removeQueue };
}

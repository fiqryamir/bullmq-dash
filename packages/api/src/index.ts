import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { errorHandler } from './handlers/error';
import type { BaseAdapter } from './queueAdapters/base';
import { getQueuesApi } from './queuesApi';
import { appRoutes } from './routes';
import type { BoardOptions, IServerAdapter } from './typings/app';

export { BaseAdapter } from './queueAdapters/base';
export { BullMQAdapter } from './queueAdapters/bullMQ';
export { buildBullBoardRequest } from './serverAdapter/request';
export { expandRouteDefs } from './serverAdapter/routes';
export * from './typings/app';

type CreateBullBoardArgs = {
  queues: ReadonlyArray<BaseAdapter>;
  serverAdapter: IServerAdapter;
  options?: BoardOptions;
};

function resolveUIPackagePath(uiBasePath?: string): string {
  if (uiBasePath) {
    return uiBasePath;
  }

  const require = createRequire(typeof __filename === 'undefined' ? import.meta.url : __filename);
  const packageJson = '@bullmq-dash/ui/package.json';

  let resolved: string;
  try {
    resolved = require.resolve(packageJson, { paths: [process.cwd()] });
  } catch {
    try {
      resolved = require.resolve(packageJson);
    } catch {
      throw new Error(
        `Cannot find the '@bullmq-dash/ui' package — install it alongside '@bullmq-dash/api' ` +
          `or pass options.uiBasePath pointing at a built UI bundle.`
      );
    }
  }

  return dirname(resolved);
}

export function createBullBoard({ queues, serverAdapter, options }: CreateBullBoardArgs) {
  const uiPath = resolveUIPackagePath(options?.uiBasePath);
  const { bullBoardQueues, setQueues, replaceQueues, addQueue, removeQueue } = getQueuesApi(queues);

  serverAdapter
    .setQueues(bullBoardQueues)
    .setViewsPath(join(uiPath, 'dist'))
    .setStaticPath('/assets', join(uiPath, 'dist', 'assets'))
    .setUIConfig({
      boardTitle: 'bullmq-dash',
      ...options?.uiConfig,
      // The board option wins; the uiConfig spelling is honored as a fallback
      // so callers who only set `uiConfig.readOnly` are not silently writable.
      readOnly: options?.readOnly ?? options?.uiConfig?.readOnly ?? false,
    })
    .setEntryRoute(appRoutes.entryPoint!)
    .setErrorHandler(errorHandler)
    .setApiRoutes(appRoutes.api);

  return { setQueues, replaceQueues, addQueue, removeQueue };
}

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { errorHandler } from './handlers/error';
import { MetricsCapture } from './metrics/capture';
import { registerMetricsStore } from './metrics/registry';
import { MetricsStore } from './metrics/store';
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

  // Historical metrics: capture is always on for every watched queue, writing
  // auto-expiring minute buckets through the queues' own Redis connection.
  const metricsStore = new MetricsStore(undefined, {
    ...(options?.metrics?.retentionSeconds !== undefined
      ? { retentionSeconds: options.metrics.retentionSeconds }
      : {}),
    ...(options?.metrics?.prefix !== undefined ? { prefix: options.metrics.prefix } : {}),
  });
  const capture = new MetricsCapture(metricsStore);
  registerMetricsStore(bullBoardQueues, metricsStore);

  const syncCapture = async (): Promise<void> => {
    for (const [queueName, adapter] of bullBoardQueues) {
      const source = await adapter.getMetricsSource();
      if (source) {
        await capture.addQueue(queueName, source);
      }
    }
    for (const queueName of capture.queueNames()) {
      if (!bullBoardQueues.has(queueName)) {
        await capture.removeQueue(queueName);
      }
    }
  };
  const syncCaptureQuietly = (): void => {
    void syncCapture().catch(() => {});
  };

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

  syncCaptureQuietly();

  const board = {
    setQueues: (newQueues: ReadonlyArray<BaseAdapter>): void => {
      setQueues(newQueues);
      syncCaptureQuietly();
    },
    replaceQueues: (newQueues: ReadonlyArray<BaseAdapter>): void => {
      replaceQueues(newQueues);
      syncCaptureQuietly();
    },
    addQueue: (queue: BaseAdapter): void => {
      addQueue(queue);
      syncCaptureQuietly();
    },
    removeQueue: (queueOrName: string | BaseAdapter): void => {
      removeQueue(queueOrName);
      syncCaptureQuietly();
    },
    /**
     * Closes the metrics capture's connections. The board otherwise has no
     * teardown, mirroring bull-board; embedded hosts that shut down cleanly
     * should call this so the event listeners do not linger.
     */
    closeMetrics: (): Promise<void> => capture.close(),
  };

  return board;
}

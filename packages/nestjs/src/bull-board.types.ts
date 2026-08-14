import { createBullBoard } from '@bullmq-dash/api';
import type {
  BaseAdapter,
  BoardOptions,
  IServerAdapter,
  QueueAdapterOptions,
} from '@bullmq-dash/api';
import type {
  InjectionToken,
  ModuleMetadata,
  OptionalFactoryDependency,
} from '@nestjs/common';

export type BullBoardInstance = ReturnType<typeof createBullBoard>;

export type BullBoardModuleOptions = {
  route: string;
  adapter: { new (): BullBoardServerAdapter };
  boardOptions?: BoardOptions;
  // An opaque middleware function or class handed straight to Nest — its shape
  // is the framework's, not the module's.
  middleware?: unknown;
};

export type BullBoardModuleAsyncOptions = {
  useFactory: (...args: unknown[]) => BullBoardModuleOptions | Promise<BullBoardModuleOptions>;
  imports?: ModuleMetadata['imports'];
  inject?: Array<InjectionToken | OptionalFactoryDependency>;
};

type BullBoardQueueCommonOptions = {
  // The queue a queue adapter wraps differs per library generation (BullMQ v4/v5/v6,
  // Bull), so the constructor parameter is intentionally unchecked.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: { new (queue: any, options?: Partial<QueueAdapterOptions>): BaseAdapter };
  options?: Partial<QueueAdapterOptions>;
};

export type BullBoardQueueOptions = BullBoardQueueCommonOptions &
  (
    | {
        /**
         * The queue name to resolve from the Nest DI container (via `getQueueToken`).
         */
        name: string;
        queue?: undefined;
      }
    | {
        /**
         * A queue instance to register directly, bypassing the DI container lookup.
         */
        queue: unknown;
        name?: string;
      }
  );

// create our own types with the needed functions, so we don't need to include
// the express/fastify libraries here.
export type BullBoardServerAdapter = IServerAdapter & { setBasePath(path: string): unknown };
export type BullBoardFastifyAdapter = BullBoardServerAdapter & { registerPlugin(): unknown };
export type BullBoardExpressAdapter = BullBoardServerAdapter & { getRouter(): unknown };

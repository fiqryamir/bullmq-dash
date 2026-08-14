import { createBullBoard } from '@bullmq-dash/api';
import {
  Inject,
  Module,
  type DynamicModule,
  type MiddlewareConsumer,
  type NestModule,
  type Provider,
} from '@nestjs/common';
import { ApplicationConfig, HttpAdapterHost } from '@nestjs/core';
import {
  BULL_BOARD_ADAPTER,
  BULL_BOARD_INSTANCE,
  BULL_BOARD_OPTIONS,
} from './bull-board.constants';
import type {
  BullBoardModuleAsyncOptions,
  BullBoardModuleOptions,
  BullBoardServerAdapter,
} from './bull-board.types';
import { isExpressAdapter, isFastifyAdapter } from './bull-board.util';

function createBullBoardProvider(): Provider {
  return {
    provide: BULL_BOARD_INSTANCE,
    useFactory: (adapter: BullBoardServerAdapter, options: BullBoardModuleOptions) =>
      createBullBoard({
        queues: [],
        serverAdapter: adapter,
        ...(options.boardOptions ? { options: options.boardOptions } : {}),
      }),
    inject: [BULL_BOARD_ADAPTER, BULL_BOARD_OPTIONS],
  };
}

@Module({})
export class BullBoardRootModule implements NestModule {
  constructor(
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
    @Inject(ApplicationConfig) private readonly applicationConfig: ApplicationConfig,
    @Inject(BULL_BOARD_ADAPTER) private readonly adapter: BullBoardServerAdapter,
    @Inject(BULL_BOARD_OPTIONS) private readonly options: BullBoardModuleOptions
  ) {}

  configure(consumer: MiddlewareConsumer): void {
    const addForwardSlash = (path: string) =>
      path.startsWith('/') || path === '' ? path : `/${path}`;

    const shouldBypassGlobalPrefix = () => {
      const prefixOptions = this.applicationConfig.getGlobalPrefixOptions();
      if (!prefixOptions?.exclude) return false;

      return prefixOptions.exclude.some((exclusion) =>
        exclusion.pathRegex.test(addForwardSlash(this.options.route))
      );
    };

    const prefix = shouldBypassGlobalPrefix()
      ? addForwardSlash(this.options.route)
      : addForwardSlash(this.applicationConfig.getGlobalPrefix() + this.options.route);

    this.adapter.setBasePath(prefix);

    if (isFastifyAdapter(this.adapter)) {
      this.adapterHost.httpAdapter
        .getInstance()
        .register(this.adapter.registerPlugin(), { prefix });

      if (this.options.middleware) {
        consumer
          .apply(this.options.middleware as (...args: unknown[]) => unknown)
          .forRoutes(this.options.route);
      }
      return;
    }

    if (isExpressAdapter(this.adapter)) {
      const chain: ((...args: unknown[]) => unknown)[] = this.options.middleware
        ? [this.options.middleware as (...args: unknown[]) => unknown, this.adapter.getRouter() as (...args: unknown[]) => unknown]
        : [this.adapter.getRouter() as (...args: unknown[]) => unknown];
      consumer.apply(...chain).forRoutes(this.options.route);
    }
  }

  static forRoot(options: BullBoardModuleOptions): DynamicModule {
    const serverAdapter = new options.adapter();

    const serverAdapterProvider: Provider = {
      provide: BULL_BOARD_ADAPTER,
      useFactory: () => serverAdapter,
    };

    const optionsProvider: Provider = {
      provide: BULL_BOARD_OPTIONS,
      useValue: options,
    };

    return {
      module: BullBoardRootModule,
      global: true,
      providers: [serverAdapterProvider, optionsProvider, createBullBoardProvider()],
      exports: [serverAdapterProvider, optionsProvider, BULL_BOARD_INSTANCE],
    };
  }

  static forRootAsync(options: BullBoardModuleAsyncOptions): DynamicModule {
    const serverAdapterProvider: Provider = {
      provide: BULL_BOARD_ADAPTER,
      useFactory: (options: BullBoardModuleOptions) => new options.adapter(),
      inject: [BULL_BOARD_OPTIONS],
    };

    const optionsProvider: Provider = {
      provide: BULL_BOARD_OPTIONS,
      useFactory: options.useFactory,
      ...(options.inject ? { inject: options.inject } : {}),
    };

    return {
      module: BullBoardRootModule,
      global: true,
      ...(options.imports ? { imports: options.imports } : {}),
      providers: [serverAdapterProvider, optionsProvider, createBullBoardProvider()],
      exports: [serverAdapterProvider, optionsProvider, BULL_BOARD_INSTANCE],
    };
  }
}

---
title: NestJS adapter
description: Add the bullmq-dash dashboard to a NestJS application with the BullBoardModule.
---

`@bullmq-dash/nestjs` is a Nest module that wraps the Express or Fastify
adapter and registers your `@nestjs/bullmq` queues automatically.

```bash
pnpm add @bullmq-dash/api @bullmq-dash/nestjs @bullmq-dash/express
```

## Registration

`BullBoardModule.forRoot` takes the route, the server adapter class, and
optional board options:

```ts
import { Module } from '@nestjs/common';
import { BullBoardModule } from '@bullmq-dash/nestjs';
import { ExpressAdapter } from '@bullmq-dash/express';

@Module({
  imports: [
    BullBoardModule.forRoot({
      route: '/dashboard',
      adapter: ExpressAdapter,
    }),
  ],
})
export class AppModule {}
```

The dashboard is served at `/dashboard` and honors your application's global
prefix (including any `exclude` patterns).

## Registering queues

In each feature module that owns BullMQ queues, register them with
`forFeature`. Queues named here are resolved from Nest's DI using the same
token `@nestjs/bullmq` uses (`getQueueToken`):

```ts
@Module({
  imports: [
    BullModule.registerQueue({ name: 'emails' }),
    BullBoardModule.forFeature({ name: 'emails' }),
  ],
})
export class EmailsModule {}
```

A direct queue instance also works:

```ts
BullBoardModule.forFeature({
  queue: emailsQueue, // a BullMQ Queue instance
  name: 'emails',
});
```

## Injecting the board

`InjectBullBoard()` injects the board instance so you can manage queues at
runtime - `setQueues`, `addQueue`, `removeQueue`, and so on:

```ts
import { Injectable } from '@nestjs/common';
import { InjectBullBoard } from '@bullmq-dash/nestjs';
import type { BullBoardInstance } from '@bullmq-dash/nestjs';

@Injectable()
export class BoardService {
  constructor(@InjectBullBoard() private board: BullBoardInstance) {}
}
```

## Async options

`forRootAsync` builds the options through a factory, for example to read the
route from configuration:

```ts
BullBoardModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    route: config.get('DASHBOARD_ROUTE') ?? '/dashboard',
    adapter: ExpressAdapter,
  }),
});
```

## Read-only boards

Pass `boardOptions: { readOnly: true }` to disable every mutation - the API
answers each mutating route with `403` and the UI hides the action controls:

```ts
BullBoardModule.forRoot({
  route: '/dashboard',
  adapter: ExpressAdapter,
  boardOptions: { readOnly: true },
});
```

Use the Fastify adapter by installing `@bullmq-dash/fastify` and passing
`FastifyAdapter` instead - everything else is identical.

---
'@bullmq-dash/nestjs': minor
---

New `@bullmq-dash/nestjs` package: the NestJS server adapter. `BullBoardModule.forRoot({ route, adapter, boardOptions, middleware })` (or `forRootAsync`) instantiates the chosen server adapter (Express or Fastify), wires the board into Nest's HTTP layer, and honors the app's global prefix (including route exclusions) when mounting the dashboard and setting its `<base href>`. `BullBoardModule.forFeature({ name, adapter, options })` registers queues per feature module — resolving them from the Nest DI container by their `@nestjs/bull-shared` `getQueueToken(name)` (so queues registered through `@nestjs/bullmq`'s `BullModule.registerQueue` are picked up automatically), or taking a queue instance directly.

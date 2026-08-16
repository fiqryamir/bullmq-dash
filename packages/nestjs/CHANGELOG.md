# @bullmq-dash/nestjs

## 2.0.0

### Minor Changes

- a3021b1: New `@bullmq-dash/nestjs` package: the NestJS server adapter. `BullBoardModule.forRoot({ route, adapter, boardOptions, middleware })` (or `forRootAsync`) instantiates the chosen server adapter (Express or Fastify), wires the board into Nest's HTTP layer, and honors the app's global prefix (including route exclusions) when mounting the dashboard and setting its `<base href>`. `BullBoardModule.forFeature({ name, adapter, options })` registers queues per feature module — resolving them from the Nest DI container by their `@nestjs/bull-shared` `getQueueToken(name)` (so queues registered through `@nestjs/bullmq`'s `BullModule.registerQueue` are picked up automatically), or taking a queue instance directly.

### Patch Changes

- Updated dependencies [b224085]
- Updated dependencies [1e85a0a]
- Updated dependencies [f0bbc91]
- Updated dependencies [41552ba]
- Updated dependencies [dc20e6c]
- Updated dependencies [c5876b7]
- Updated dependencies [ef51d9f]
- Updated dependencies [7428e23]
- Updated dependencies [76ed550]
  - @bullmq-dash/api@2.0.0

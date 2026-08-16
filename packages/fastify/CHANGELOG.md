# @bullmq-dash/fastify

## 2.0.0

### Minor Changes

- b224085: New `@bullmq-dash/fastify` package: the Fastify server adapter. `FastifyAdapter` implements the same `IServerAdapter` contract as the Express adapter, and `registerPlugin()` returns a Fastify plugin that mounts the core's full route table — queues, per-state jobs, job detail + logs, search, and every mutation (all gated by `readOnly`) — and serves the UI SPA entry (ejs via `@fastify/view`) and its static assets (`@fastify/static`). The plugin picks up a host-app base path from `setBasePath` or the Fastify `prefix` option for the `<base href>`.

  The core gains two server-adapter helpers — `buildBullBoardRequest` (assembles the `BullBoardRequest` a handler receives from a framework request, defaulting an absent body to `{}`) and `expandRouteDefs` (expands array methods/routes into every method-route pair) — and the Express adapter now builds on them.

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

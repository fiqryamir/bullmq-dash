# @bullmq-dash/express

## 1.0.0-alpha.2

### Patch Changes

- @bullmq-dash/api@1.0.0-alpha.2

## 1.0.0-alpha.1

### Patch Changes

- fd18a38: Raise the Node floor to `>=22.12.0` across the suite - the docs site's
  toolchain (Astro 6 / Starlight 0.40) brings in `@astrojs/prism@4`, which
  requires Node 22.12+, and the repo's `engine-strict` setting makes that a
  hard install requirement. No package code changes.
- b224085: New `@bullmq-dash/fastify` package: the Fastify server adapter. `FastifyAdapter` implements the same `IServerAdapter` contract as the Express adapter, and `registerPlugin()` returns a Fastify plugin that mounts the core's full route table — queues, per-state jobs, job detail + logs, search, and every mutation (all gated by `readOnly`) — and serves the UI SPA entry (ejs via `@fastify/view`) and its static assets (`@fastify/static`). The plugin picks up a host-app base path from `setBasePath` or the Fastify `prefix` option for the `<base href>`.

  The core gains two server-adapter helpers — `buildBullBoardRequest` (assembles the `BullBoardRequest` a handler receives from a framework request, defaulting an absent body to `{}`) and `expandRouteDefs` (expands array methods/routes into every method-route pair) — and the Express adapter now builds on them.

- Updated dependencies [fd18a38]
- Updated dependencies [b224085]
- Updated dependencies [1e85a0a]
- Updated dependencies [f0bbc91]
- Updated dependencies [41552ba]
- Updated dependencies [dc20e6c]
- Updated dependencies [c5876b7]
- Updated dependencies [ef51d9f]
- Updated dependencies [7428e23]
- Updated dependencies [76ed550]
  - @bullmq-dash/api@1.0.0-alpha.1

## 1.0.0

### Minor Changes

- 65d752a: Express walking skeleton: `BullMQAdapter` wraps a BullMQ `Queue`, and the new `@bullmq-dash/express` server adapter mounts the core's route table on the host app, serving `GET /api/queues` with per-state counts for every registered queue.

### Patch Changes

- Updated dependencies [65d752a]
  - @bullmq-dash/api@1.0.0

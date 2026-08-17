# @bullmq-dash/api

## 1.0.0-alpha.2

## 1.0.0-alpha.1

### Minor Changes

- b224085: New `@bullmq-dash/fastify` package: the Fastify server adapter. `FastifyAdapter` implements the same `IServerAdapter` contract as the Express adapter, and `registerPlugin()` returns a Fastify plugin that mounts the core's full route table — queues, per-state jobs, job detail + logs, search, and every mutation (all gated by `readOnly`) — and serves the UI SPA entry (ejs via `@fastify/view`) and its static assets (`@fastify/static`). The plugin picks up a host-app base path from `setBasePath` or the Fastify `prefix` option for the `<base href>`.

  The core gains two server-adapter helpers — `buildBullBoardRequest` (assembles the `BullBoardRequest` a handler receives from a framework request, defaulting an absent body to `{}`) and `expandRouteDefs` (expands array methods/routes into every method-route pair) — and the Express adapter now builds on them.

- 1e85a0a: Flow view: `GET /api/queues/:queueName/flow` assembles the queue-level flow graph - root jobs discovered across the active, waiting, and waiting-children states, each expanded into its child tree via `FlowProducer.getFlow` (depth capped at 5, the response capped at 200 nodes with a `truncated` notice), and `GET /api/queues/:queueName/:jobId/flow` serves a job's flow tree from its root (mirroring bull-board's `{ nodeId, isFlowNode, flowRoot }` shape, walking the parent chain across queues). The UI renders the graph with @xyflow/react + @dagrejs/dagre: dagre auto-layout, state-colored nodes, and click-to-detail navigation; a Flow button on the queue's jobs view opens the whole-pipeline graph, and the job detail view shows the job's flow tree when it is part of a flow.
- f0bbc91: Historical metrics for queues: `GET /api/queues/:queueName/metrics` serves
  per-minute buckets — completed/failed counts plus duration and wait averages
  — over a 24h window (clamped to 7d, the store's default retention).

  `createBullBoard` now runs an always-on capture per watched queue: a
  QueueEvents listener (own duplicate connection, honors the queue's Redis key
  prefix) turns the waiting→active→completed/failed stream into auto-expiring
  minute bucket hashes under `bullmq-dash:metrics:*`, configurable via
  `options.metrics.{retentionSeconds,prefix}`; the board returns a
  `closeMetrics()` teardown. The endpoint merges BullMQ's native counters so
  downtime while the dashboard is down still shows — note those only record
  when the embedded host's workers opt in (`maxMetricsSize` on v5 queues,
  `metrics.maxDataPoints` on v6 workers).

  The UI adds a per-queue metrics view (`uiConfig.showMetrics === false`
  hides it): counts/duration/wait line charts over 24h or 7d, token-based
  colors, a summary line, and a data-table fallback for screen readers and
  no-JS environments.

  Fixed along the way: the store now binds to the first captured queue's
  client (previously writes were silently dropped) and registers its Lua
  script on BullMQ v6's adapted clients (previously `runCommand` failed on
  the first write).

- 41552ba: Job detail view: `GET /api/queues/:queueName/:jobId` returns the job's data, options, progress, attempts, stacktrace, and timestamps (mirroring bull-board's `{ job, status }` shape), and `GET /api/queues/:queueName/:jobId/logs` pages the job's log rows newest-first (`page`, `logsPerPage`) with a total count. Clicking a job row in the jobs list opens the detail view showing data, options, failed reason, stacktrace, and paginated logs.
- dc20e6c: Job + queue actions, all gated by `readOnly`. `createBullBoard` accepts `options.readOnly` (or `uiConfig.readOnly`) — when set, every mutating REST route answers 403 and the queues response marks each queue read-only so the UI hides the controls. Mutation endpoints mirror bull-board's shapes (`PUT /api/queues/:queueName/retry/:queueStatus` → `{ retried, skipped }`, `.../promote`, `.../clean/:queueStatus` with a `grace` in seconds, `.../pause`, `.../resume`, `.../empty`, and per-job `PUT /api/queues/:queueName/:jobId/retry|promote` → 204), plus two additions beyond bull-board: job remove (`.../:jobId/remove`, with the `.../:jobId/clean` route kept as bull-board's alias) and bulk remove by state (`.../remove/:queueStatus` → `{ removed }`). The UI wires every action: per-row Retry/Promote/Remove, per-tab Retry all/Promote all/Clean/Remove all (with confirmation for destructive ones), and Pause/Resume/Empty in the queue header — all hidden in read-only mode.
- c5876b7: Job search: `GET /api/search` searches jobs by id or name across every visible queue, and `GET /api/queues/:queueName/search` scopes the search to one queue — case-insensitive substring matches, narrowed by a comma-separated `status` list, results capped at 500 with a `start` deepen-search continuation (`totalScanned`/`deepen` in the response). The UI adds a 300ms-debounced command palette with state filter chips, a virtualized result list, and a deepen button that continues past the cap: cross-queue on the home view, scoped to the queue inside a queue's jobs view. Clicking a result opens the job's detail from any queue.
- ef51d9f: Per-queue jobs view: `GET /api/queues/:queueName/jobs` pages BullMQ's `getJobs` for one state (`status`, `page`, `jobsPerPage`), and the UI opens a queue's jobs list with a six-state switcher (waiting, active, completed, failed, delayed, paused), a TanStack Table + Virtual job table (id, name, state, progress, attempts), and pagination. On BullMQ v6, the paused tab shows a paused queue's waiting jobs.
- 7428e23: Schedulers, workers and Redis stats views complete the bull-board parity
  set. The API mirrors bull-board's routes — `GET /api/job-schedulers`
  (optional `queueName` scope), `GET /api/queues/:queueName/workers`,
  `GET /api/redis/stats` (parsed with `redis-info`: version, memory, clients),
  `PATCH /api/queues/:queueName/job-schedulers/:schedulerId` and
  `PUT /api/queues/:queueName/job-schedulers/:schedulerId/remove` — and adds
  scheduler creation, which bull-board lacks:
  `POST /api/queues/:queueName/job-schedulers` with
  `{ id, repeat, jobTemplate? }` backed by BullMQ's `upsertJobScheduler`
  (201 with the created scheduler). Every scheduler mutation honors the
  board-level `readOnly` option and per-queue `readOnlyMode` with a 403;
  `hideRedisDetails` and `showWorkers: false` gate the two read endpoints the
  same way.

  The UI turns the queue header's view buttons into a persistent tab strip
  (Jobs, Schedulers, Workers, Redis, Flow, Metrics): the schedulers view lists
  schedulers with schedule, next/last run and iteration counts and offers an
  inline add/edit form plus confirm-gated remove (hidden under readOnly), the
  workers view lists name/address/connected-for, and the Redis view renders
  memory, version and client stats as calm panels.

- 76ed550: New `@bullmq-dash/ui` package: the dashboard SPA shell (Base UI design system, dark mode by default with a light toggle, search-first command bar) rendering the queues list live from `GET /api/queues`. `createBullBoard` now resolves the UI package and drives the server adapter to serve the SPA's entry template and static assets; `options.uiBasePath` still overrides the bundle location.

### Patch Changes

- fd18a38: Raise the Node floor to `>=22.12.0` across the suite - the docs site's
  toolchain (Astro 6 / Starlight 0.40) brings in `@astrojs/prism@4`, which
  requires Node 22.12+, and the repo's `engine-strict` setting makes that a
  hard install requirement. No package code changes.

## 1.0.0

### Minor Changes

- 65d752a: Express walking skeleton: `BullMQAdapter` wraps a BullMQ `Queue`, and the new `@bullmq-dash/express` server adapter mounts the core's route table on the host app, serving `GET /api/queues` with per-state counts for every registered queue.

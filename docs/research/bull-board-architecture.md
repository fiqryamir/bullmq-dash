# bull-board Architecture (research)

Researched 2026-08-13 against the bull-board repo `master` branch (all packages at v8.6.1) and the npm registry. Every claim cites the source that owns it.

## 1. Summary

bull-board (repo: `felixmosh/bull-board`, MIT) is a yarn-4 workspaces monorepo that ships a framework-agnostic **core API** (`@bull-board/api`), a **prebuilt React SPA** (`@bull-board/ui`), and one **server adapter per web framework**. The core takes an array of **queue adapters** (thin wrappers over a Bull `Queue` or BullMQ `Queue`) plus a **server adapter** implementing a small fluent interface (`IServerAdapter`), registers a fixed set of REST routes (`/api/*`) and an SPA entry view on the server adapter, and returns queue-management functions. The UI fetches everything from those REST endpoints; assets are served statically from the `@bull-board/ui` package.

The old unscoped `bull-board` npm package (2.x) is fully deprecated in favor of the `@bull-board/*` scope.

## 2. Monorepo layout

- Root package `@bull-board/root` v8.6.1, private, `packageManager: yarn@4.17.0` (Yarn Berry), workspaces: `packages/*`, `website`, `website/demo`.
  Source: https://github.com/felixmosh/bull-board/blob/master/package.json
- Packages directory listing (13 packages): `api`, `bun`, `elysia`, `express`, `fastify`, `h3`, `hapi`, `hono`, `koa`, `metrics`, `nestjs`, `test-utils`, `ui`.
  Source: GitHub API `repos/felixmosh/bull-board/contents/packages`.
- Tooling: `oxlint` for lint, `oxfmt` for formatting, `jest` per package, `ts-node-dev` for the dev server, `release-it` + `@release-it-plugins/workspaces` for versioning (all packages are released in lockstep at one version).
  Source: https://github.com/felixmosh/bull-board/blob/master/package.json
- Docs live in the repo at `website/docs/` (an rspress site, published to https://felixmosh.github.io/bull-board/), with sections `guide/`, `configuration/`, `queue-adapters/`, `recipes/`, `server-adapters/`.
  Sources: https://github.com/felixmosh/bull-board/blob/master/README.md ; GitHub API `repos/felixmosh/bull-board/contents/website/docs`.

## 3. Packages and current versions

All packages share one version, 8.6.1 (npm `dist-tags.latest`, checked 2026-08-13).

| Package | Role |
| --- | --- |
| `@bull-board/api` 8.6.1 | Core: `createBullBoard`, route definitions, handlers, queue adapter classes. Deps: `redis-info` only. Peer deps (both optional): `bull ^4.16.5`, `bullmq ^5.79.2 || ^6.0.0`, and `@bull-board/ui 8.6.1`. |
| `@bull-board/ui` 8.6.1 | Prebuilt React SPA (rsbuild) + ejs entry template. Depends on `@bull-board/api` (for typings). |
| `@bull-board/express` 8.6.1 | Express adapter. |
| `@bull-board/fastify` 8.6.1 | Fastify adapter. |
| `@bull-board/koa` 8.6.1 | Koa adapter. |
| `@bull-board/hapi` 8.6.1 | Hapi adapter. |
| `@bull-board/nestjs` 8.6.1 | NestJS module (wraps the express or fastify adapter). |
| `@bull-board/hono` 8.6.1 | Hono adapter (node, bun, deno, cloudflare workers/pages). |
| `@bull-board/h3` 8.6.1 | h3 adapter. |
| `@bull-board/elysia` 8.6.1 | Elysia adapter. |
| `@bull-board/bun` 8.6.1 | Bun-native adapter. |
| `@bull-board/metrics` 8.6.1 | Optional long-retention metrics history provider. |
| `@bull-board/test-utils` 8.6.1 | Test helpers. |

Sources: https://github.com/felixmosh/bull-board/blob/master/README.md (package table); https://github.com/felixmosh/bull-board/blob/master/packages/api/package.json ; npm registry `dist-tags` for each `@bull-board/*` package.

## 4. Core API shape: `createBullBoard`

Signature (source: https://github.com/felixmosh/bull-board/blob/master/packages/api/src/index.ts):

```ts
createBullBoard({
  queues: ReadonlyArray<BaseAdapter>,
  serverAdapter: IServerAdapter,
  options?: BoardOptions, // { uiBasePath?, uiConfig?, historyProvider? }
})
// returns { setQueues, replaceQueues, addQueue, removeQueue }
```

Behavior:

1. Queues are stored in a `Map<string, BaseAdapter>` keyed by `adapter.getName()` (`BullBoardQueues` type). `setQueues` merges (never clears), `replaceQueues` drops entries not in the new list, `addQueue`/`removeQueue` mutate single entries.
   Source: https://github.com/felixmosh/bull-board/blob/master/packages/api/src/queuesApi.ts
2. UI asset location is resolved at runtime via `require.resolve('@bull-board/ui/package.json')` (the UI package is a peer dependency); `options.uiBasePath` overrides it.
3. It then drives the server adapter through its fluent interface, in order: `setQueues(...)` → `setViewsPath(<ui>/dist)` → `setStaticPath('/static', <ui>/dist/static)` → `setUIConfig({...defaults, ...options.uiConfig, ...provider-derived flags})` → `setEntryRoute(appRoutes.entryPoint)` → `setErrorHandler(errorHandler)` → `setApiRoutes(apiRoutes)`.
   Defaults: `boardTitle: 'Bull Dashboard'`, favicons under `static/`.
4. `options.historyProvider` (the `MetricsHistoryProvider` interface from `@bull-board/metrics`) optionally adds four routes: `GET /api/metrics/history`, `GET /api/metrics/history/usage`, `POST /api/metrics/history/purge`, `GET /api/metrics/latency` — only the routes whose provider capability exists are registered.
5. `options.uiConfig` is a `Partial<UIConfig>`: `boardTitle`, `boardLogo`, `miscLinks`, `hideDocsLink`, `queueSortOptions`, `favIcon`, `locale`, `dateFormats`, `pollingInterval`, `menu`, `overview`, `sortQueues`, `hideRedisDetails`, `showMetrics`, `showWorkers`, `environment` badge, and the provider-derived `hasHistoryProvider`/`hasHistoryUsage`/`canPurgeHistory`/`hasLatencyHistory` flags (core-owned, always win over caller values).
   Source: https://github.com/felixmosh/bull-board/blob/master/packages/api/typings/app.d.ts

## 5. Queue adapter pattern

- `BaseAdapter` is an abstract class in the core (`packages/api/src/queueAdapters/base.ts`), not an interface. Public shape:
  - Options fields: `readOnlyMode`, `allowRetries`, `allowCompletedRetries`, `prefix`, `delimiter`, `description`, `displayName`, `jobDataSchema`, `type` (`'bull' | 'bullmq'`), `externalJobUrl`.
  - Presentation hooks: `setFormatter(field, fn)` / `format(...)` for per-field display formatting (`data`, `returnValue`, `name`, `progress`); `setVisibilityGuard(guard)` / `isVisible(request)` for per-queue visibility.
  - Abstract methods the core handlers call: `getName`, `getStatuses`, `getJobStatuses`, `getJobCounts`, `getJobs(statuses, start, end)`, `getJob(id)`, `addJob(name, data, options)`, `getJobLogs(id)`, `getMetrics(type, start, end)`, `getRedisInfo`, `isPaused`, `pause`, `resume`, `clean(status, graceTimeMs)`, `empty`, `obliterate`, `promoteAll`, `getGlobalConcurrency`, `setGlobalConcurrency`, `getJobSchedulers`, `getJobSchedulersCount`, `removeJobScheduler`, `updateJobScheduler`.
  - Optional overrides: `getDatastoreStats` (non-Redis stats), `getWorkers` (via `CLIENT LIST`), `getQueueDefaultJobOptions`, `supportsJobSchedulerUpdate` (false by default; true for BullMQ).
  Source: https://github.com/felixmosh/bull-board/blob/master/packages/api/src/queueAdapters/base.ts
- `BullMQAdapter` wraps a BullMQ **`Queue`** — and only a `Queue`. It does **not** wrap `QueueEvents`; a code search of the repo finds no `QueueEvents` usage anywhere. It lazily creates a BullMQ `FlowProducer` (cached per connection/backend in a `WeakMap`) purely to serve the job-flow view. The constructor validates the queue instance (`queue instanceof Queue` or BullMQ meta values) and throws otherwise. It supports both BullMQ v5 (`queue.client`) and v6 (`queue.getBackend()`, including PostgreSQL datastore stats).
  Source: https://github.com/felixmosh/bull-board/blob/master/packages/api/src/queueAdapters/bullMQ.ts
- `BullAdapter` wraps a Bull **`Queue`** and disables completed-retries (Bull cannot retry completed jobs). Repeats become "job schedulers" via `getRepeatableJobs()`, and `updateJobScheduler` is unsupported for Bull.
  Source: https://github.com/felixmosh/bull-board/blob/master/packages/api/src/queueAdapters/bull.ts
- A `BullMQProAdapter` exists for BullMQ Pro (adds producer capabilities) — see the `bullMQProAdapter` export below.
  Source: https://github.com/felixmosh/bull-board/blob/master/packages/api/package.json
- Export map of `@bull-board/api`: `"."` → compiled `dist/index.js`; subpaths `./bullMQAdapter`, `./bullMQProAdapter`, `./bullAdapter` (root-level shim files re-exporting from `dist/queueAdapters/*`), `./baseAdapter` (typings), `./typings/*`, `./constants/statuses`, `./constants/datastores`, `./dist/*`.
  Sources: https://github.com/felixmosh/bull-board/blob/master/packages/api/package.json ; https://github.com/felixmosh/bull-board/blob/master/packages/api/bullMQAdapter.js

## 6. Server adapter pattern

- The contract is `IServerAdapter` (from `@bull-board/api/typings/app`), a fluent interface the core drives exactly once per board:
  `setQueues(map)` → `setViewsPath(path)` → `setStaticPath(route, path)` → `setUIConfig(config)` → `setEntryRoute(route)` → `setErrorHandler(fn)` → `setApiRoutes(routes)`. Handlers receive a normalized `BullBoardRequest` `{ queues, uiConfig, query, params, body, headers }` and return `{ status?, body }`.
  Source: https://github.com/felixmosh/bull-board/blob/master/packages/api/typings/app.d.ts
- Each adapter translates that contract into its framework's routing:
  - **express** (`ExpressAdapter`): creates its own `express()` app, mounts a JSON `Router` for API routes (with a `wrapAsync` error bridge), renders the entry view via ejs (`app.set('view engine', 'ejs')`), serves `/static` with `express.static`. User mounts with `app.use(path, adapter.getRouter())` and sets the base path with `setBasePath()`.
    Source: https://github.com/felixmosh/bull-board/blob/master/packages/express/src/ExpressAdapter.ts
  - **fastify** (`FastifyAdapter`): stores config, then `registerPlugin()` returns a `FastifyPluginCallback` that registers `@fastify/static`, `@fastify/view` (ejs), the SPA routes, the API routes, and `fastify.setErrorHandler`.
    Source: https://github.com/felixmosh/bull-board/blob/master/packages/fastify/src/FastifyAdapter.ts
  - **hono** (`HonoAdapter`): constructor takes a platform `serveStatic` implementation (node, bun, deno, cloudflare-workers, cloudflare-pages) plus an optional Cloudflare manifest; `registerPlugin()` returns a fresh `Hono` app.
    Source: https://github.com/felixmosh/bull-board/blob/master/packages/hono/src/HonoAdapter.ts
  - **nestjs**: a Nest module, not a raw adapter — `BullBoardModule.forRoot({ adapter: ExpressAdapter|FastifyAdapter, route, middleware, boardOptions })` (or `forRootAsync`). It instantiates the adapter, calls `createBullBoard({ queues: [], serverAdapter, options })`, wires the router into Nest's HTTP adapter host (respecting/excluding the global prefix), and `forFeature(...)` registers queues per feature module by resolving them with `getQueueToken` from `@nestjs/bull-shared` and calling `board.addQueue(...)`.
    Sources: https://github.com/felixmosh/bull-board/blob/master/packages/nestjs/src/bull-board.root-module.ts ; https://github.com/felixmosh/bull-board/blob/master/packages/nestjs/src/bull-board.feature-module.ts
  - Others in the same mold: koa (`getRouter()`), hapi, h3, elysia, bun. Docs pages per adapter: https://felixmosh.github.io/bull-board/server-adapters/ (repo: `website/docs/server-adapters/{bun,elysia,express,fastify,h3,hapi,hono,koa,nestjs}.md`).
- Entry view: every framework renders `index.ejs` (shipped in `@bull-board/ui`) with `basePath`, `title`, favicon paths, and the serialized `uiConfig` JSON (`<`/`>` escaped) injected into a `<script id="__UI_CONFIG__" type="application/json">` tag; a `<base href>` handles deep links, so SPA routes (`/`, `/queue/:queueName`, `/queue/:queueName/:jobId`, `/metrics-history`, `/job-schedulers`) all resolve to the same template.
  Sources: https://github.com/felixmosh/bull-board/blob/master/packages/api/src/handlers/entryPoint.ts ; https://github.com/felixmosh/bull-board/blob/master/packages/ui/src/index.ejs

## 7. UI-to-API contract (REST)

Defined once in the core (`packages/api/src/routes.ts`) and consumed by the UI's `Api` service (axios, `baseURL = <basePath>/api`).

Static routes (source: https://github.com/felixmosh/bull-board/blob/master/packages/api/src/routes.ts):

- `GET /api/redis/stats` → Redis/backend info
- `GET /api/queues` (query: `activeQueue`, `status`, `page`, `jobsPerPage`) → `{ queues: AppQueue[] }`; each queue carries `name`, `displayName`, `description`, `statuses`, `counts`, `jobs` (only for the active queue), `pagination`, `readOnlyMode`, `allowRetries`, `allowCompletedRetries`, `isPaused`, `type`, `delimiter`, `globalConcurrency`, `jobSchedulerCount`, `hasWorkers`
  (handler source: https://github.com/felixmosh/bull-board/blob/master/packages/api/src/handlers/queues.ts)
- `GET /api/job-schedulers` (query: `queueName`?)
- `GET /api/queues/:queueName/metrics`
- `GET /api/queues/:queueName/default-job-options`
- `GET /api/queues/:queueName/workers`
- `GET /api/queues/:queueName/job-data-schema`
- `PUT /api/queues/pause` / `PUT /api/queues/resume` (all queues)
- `GET /api/queues/:queueName/:jobId` / `.../logs` / `.../flow`
- `POST /api/queues/:queueName/add` (body `{ name, data, options }`)
- `PUT /api/queues/:queueName/retry/:queueStatus`, `.../promote`, `.../clean/:queueStatus`, `.../pause`, `.../resume`, `.../concurrency`, `.../empty`, `.../obliterate`
- `PUT /api/queues/:queueName/job-schedulers/:schedulerId/remove` ; `PATCH /api/queues/:queueName/job-schedulers/:schedulerId`
- `PUT /api/queues/:queueName/:jobId/retry` / `.../clean` / `.../promote`
- `PATCH /api/queues/:queueName/:jobId/update-data`
- With a history provider: `GET /api/metrics/history`, `GET /api/metrics/history/usage`, `POST /api/metrics/history/purge`, `GET /api/metrics/latency`

Client-side call sites mirror these one-to-one: https://github.com/felixmosh/bull-board/blob/master/packages/ui/src/services/Api.ts

Error contract: handlers may return `{ status, body }`; failures use `ErrorResponseBody { error: TranslatableMessage, message?, code?, details? }`, where `error.key` is an i18n translation key the UI resolves against its own locale files (the API never sends English prose for errors it can name).
Source: https://github.com/felixmosh/bull-board/blob/master/packages/api/typings/app.d.ts

Asset serving: `@bull-board/ui`'s `dist/` is the views root and `dist/static` is mounted at `/static` by every server adapter (`setStaticPath('/static', <ui>/dist/static)`), driven by `createBullBoard`.
Source: https://github.com/felixmosh/bull-board/blob/master/packages/api/src/index.ts

## 8. The UI package

`@bull-board/ui` is a React 19 SPA built with rsbuild: TanStack React Query for data fetching, zustand for state, axios for the REST client, recharts for charts, react-router-dom v5, i18next for locales, CodeMirror for the add-job editor, and JSON schemas generated from BullMQ's `JobsOptions` / Bull's `JobOptions` types for the job-options form. It depends on `@bull-board/api` for shared typings and ships `dist` + `typings` + the `index.ejs` template consumed by the adapters.
Sources: https://github.com/felixmosh/bull-board/blob/master/packages/ui/package.json ; https://github.com/felixmosh/bull-board/blob/master/packages/ui/src/services/Api.ts

## 9. Optional metrics history (`@bull-board/metrics`)

Opt-in, beta: a recorder snapshots BullMQ's short-lived per-minute metrics into long-retention Redis buckets and implements `MetricsHistoryProvider`; the core stays stateless without it. It adds the Metrics history page and 7/30/90-day ranges, plus (when the provider supports it) storage usage and latency percentile charts.
Sources: https://github.com/felixmosh/bull-board/blob/master/README.md ; https://github.com/felixmosh/bull-board/blob/master/packages/api/typings/app.d.ts (`MetricsHistoryProvider`)

## 10. Legacy `bull-board` 2.x: deprecation status

- npm `bull-board`: `dist-tags.latest` = **2.1.3**; first published 2019-08-29; package metadata last modified 2022-04-12. Every 2.x version (2.0.0–2.1.3) carries the npm deprecation string: **"2.x is no longer supported, we moved to use @bull-board scope"**.
  Source: https://registry.npmjs.org/bull-board
- v2.1.3 was a monolithic package (single `bull-board` npm package) built on Express + ejs, with `express@4.17.1`, `ejs@3.1.6`, `redis-info@^3.0.8` as runtime deps.
  Source: https://registry.npmjs.org/bull-board/2.1.3
- v3.0.0 (2021-05-29) "Move bull-board to use mono-repo structure (#281)" split it into the scoped packages; the v2.1.3 changelog entry (2021-06-28) notes "Add deprecation message".
  Source: https://github.com/felixmosh/bull-board/blob/master/CHANGELOG.md (v3.0.0 and v2.1.3 sections)
- Migration notes: no formal migration guide exists in the repo docs; the README's install/usage examples (`@bull-board/api` + server adapter + `createBullBoard({ queues, serverAdapter })`) are the current API. The 2.x → 3.x change was primarily packaging (scoped packages, adapter injected via `serverAdapter`) while keeping the `createBullBoard({ queues })` concept.

## 11. Primary sources

- Repo: https://github.com/felixmosh/bull-board (branch `master`)
- Root package.json: https://github.com/felixmosh/bull-board/blob/master/package.json
- README: https://github.com/felixmosh/bull-board/blob/master/README.md
- CHANGELOG: https://github.com/felixmosh/bull-board/blob/master/CHANGELOG.md
- Core: `packages/api/src/index.ts`, `routes.ts`, `queuesApi.ts`, `handlers/*`, `queueAdapters/{base,bull,bullMQ}.ts`, `typings/app.d.ts` (paths above)
- Server adapters: `packages/{express,fastify,hono,nestjs}/src/*` (paths above)
- UI: `packages/ui/src/services/Api.ts`, `packages/ui/src/index.ejs`, `packages/ui/package.json`
- Docs site: https://felixmosh.github.io/bull-board/ (repo: `website/docs/`)
- npm registry: https://registry.npmjs.org/bull-board and `@bull-board/{api,ui,express,fastify,koa,hapi,nestjs,hono,h3,elysia,bun,metrics}`

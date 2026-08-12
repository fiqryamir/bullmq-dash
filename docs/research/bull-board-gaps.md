# Research: bull-board's actual gaps (search, flow viz, standalone, metrics)

Research for GitHub issue #2. All facts below come from primary sources: the bull-board
GitHub repo (`felixmosh/bull-board`), its docs site sources (`website/docs`), its open and
closed issues/PRs (via `gh` CLI), and the npm registry. Research date: 2026-08-13.

Overall context: the project is actively maintained (latest `@bull-board/api` is `8.6.1`,
published 2026-08-12 — https://raw.githubusercontent.com/felixmosh/bull-board/master/packages/api/package.json),
and there are only **14 open issues** total (`gh issue list --repo felixmosh/bull-board --state open`,
checked 2026-08-13). The gaps are not diffuse neglect — they are concentrated in a few specific areas.

---

## 1. Job search — the biggest, oldest gap

**bull-board has no job search of any kind today.** The only "search" in the product is a
queue-name filter in the sidebar. The official docs' "Searching" section describes exactly
that and nothing else ("The filter box at the top of the sidebar matches queues by name" —
https://raw.githubusercontent.com/felixmosh/bull-board/master/website/docs/guide/exploring-the-dashboard.md).

The demand is long-standing and loud:

- **#154 "Feature Request: Search"** — open since 2020-11-06, label `enhancement`, 25+ comments.
  Users process "~ 1 million jobs daily" and want to "verify if a job ran, when it ran"; requests
  cover search by job name, job data, logs, and regex over data; multi-tenant users want to
  filter by a field like `clientId` in `data`. The thread tracks upstream
  `taskforcesh/bullmq#2135` and `taskforcesh/bullmq#3538`. (https://github.com/felixmosh/bull-board/issues/154)
- **#361 "Feature: Add search for data"** — open since 2021-12-27, label `enhancement`. The
  maintainer's response: "the underlayer bullX packages are not supporting searching... poking
  around redis keys / values is not acceptable solution" and points to his upstream request
  https://github.com/taskforcesh/bullmq/issues/2135. (https://github.com/felixmosh/bull-board/issues/361)
- **#476 "Feature: job filters"** — open since 2022-10-20, label `enhancement`. User: with
  "1.4k+ jobs in a queue... if I need to remove just one of them then it becomes an impossible
  task to do via the UI manually. I have to resort to connecting to the Redis instance".
  In Dec 2025 a user proposed a search-provider/plugin interface (board calls `plugin.search(query)`,
  integrator supplies the index) and the maintainer replied "I can go with it... Will you make a
  PR for it?" — no merged implementation as of research date. In Apr 2026 the maintainer declined
  a find-by-ID intermediate step: "I don't think that we should implement something which is not
  related to search as search... Let's wait for the official search method."
  (https://github.com/felixmosh/bull-board/issues/476)
- **Community PR #1016** ("feat: add job name filtering to queue page", Oct 2025) was **closed
  unmerged**. Maintainer: "I don't want to add a job filtering feature without support from the
  underline lib (bull / bullmq)... filtering on the lib side like you did, is not a good option...
  it will introduce a performance issues". (https://github.com/felixmosh/bull-board/pull/1016)
- Three more search requests were closed by the stale bot with no implementation:
  #879 "Add a global search through all the jobs in the queue" (closed 2025-05-04),
  #715 "Possibility to find a job in queue by it's ID" (closed 2024-11-26, maintainer again
  refused storage-key scanning), #973 "Date-Based Job Search for BullMQ Queues"
  (closed 2025-10-10, maintainer: "the underline lib... doesn't supports it... And I don't want
  to poke around in the Redis"). (https://github.com/felixmosh/bull-board/issues/879,
  https://github.com/felixmosh/bull-board/issues/715,
  https://github.com/felixmosh/bull-board/issues/973)

**The upstream blocker:** bullmq's native search PR `taskforcesh/bullmq#3538`
("feat(search): Queue search", opened 2025-11-05) is still **open and unmerged** as of
research date. (https://github.com/taskforcesh/bullmq/pull/3538)

Summary: job search is the single most-requested missing feature (open requests dating to 2020),
blocked upstream on bullmq's native search, with the maintainer explicitly refusing to touch
Redis internals or ship client-side filtering.

## 2. Flow visualization — exists per-job, no graph overview, incomplete Flow support

- **A per-job flow tree exists.** The UI package ships `JobFlow.tsx`, which renders the
  parent→children tree on the job detail page, with per-node state colors (including
  `waiting-children`), progress bars, and cross-queue links between nodes.
  (https://raw.githubusercontent.com/felixmosh/bull-board/master/packages/ui/src/components/JobFlow/JobFlow.tsx)
  The docs' "Job flows" recipe confirms: "Bull-board renders the tree on the parent job's detail
  view. Click through to jump between parents and children."
  (https://raw.githubusercontent.com/felixmosh/bull-board/master/website/docs/recipes/job-logs-and-flows.md)
- This landed around v6.20.0 (Feb 2026): issue #1088 reports a hard `bullmq` dependency
  introduced by the flow visualization in 6.20.0 (fixed in 6.20.3).
  (https://github.com/felixmosh/bull-board/issues/1088)
- **Open #277 "Feature: Add support for the new Flow method of bullmq"** — open since
  2021-05-19, label `enhancement`. Asks for support of the `waiting-children` status and
  "links to the parent job". Maintainer (2024): "I will be more than happy to review a PR for
  this feature". So Flow support is still considered incomplete. (`waiting-children` does exist
  in the API's status list and JobFlow color map, but the issue remains open.)
  (https://github.com/felixmosh/bull-board/issues/277)
- **No queue-level/graph overview.** The original #681 "BullMQ graph" asked for a
  "force directed graph... where all jobs and their parent child relationship could be viewed
  in real-time"; it was closed only after a user noted "bullboard now supports flow jobs"
  (per-job trees), not because a graph view was built. (https://github.com/felixmosh/bull-board/issues/681)
- Past flow bugs: #770 "flow children with groups are not visible in bullboard"
  (closed 2024-11-22); #1285 "Long Flows Cut Off" (flow card max-height 500px bug, fixed in
  v8.3.2, 2026-07-28). (https://github.com/felixmosh/bull-board/issues/770,
  https://github.com/felixmosh/bull-board/issues/1285)

Summary: flow trees per parent job exist and work, but there is no whole-queue flow/graph
overview, and the 2021 request for full Flow support (waiting-children handling, parent links)
is still open.

## 3. Standalone mode — doesn't exist as an official offering

- bull-board is an **embeddable library only**: "Dashboard UI for Bull and BullMQ job queues.
  Plug it into your server, see your queues." Distribution is a set of server adapters
  (express, fastify, koa, hapi, nestjs, hono, h3, elysia, bun) plus the api/ui packages.
  (https://raw.githubusercontent.com/felixmosh/bull-board/master/README.md)
- There is **no official standalone server or Docker image**. A code search of the repo finds
  no Dockerfile (only an example `.dockerignore`). The historical request **#45 "Standalone
  version"** (2019) — a container you point at Redis that auto-discovers queues — was closed by
  the stale bot without ever being implemented in the project; the community attempts (a
  `jondum/bull-board` Docker image, PR #66) stalled with merge conflicts.
  (https://github.com/felixmosh/bull-board/issues/45)
- Third-party community images exist and are referenced by users (e.g. `jondum/bull-board` in
  #45; `Diluka/bull-board-docker` in #1276), but they are not maintained by the project.
  (https://github.com/felixmosh/bull-board/issues/1276)
- Even the **Next.js standalone build** mode has a known packaging gap: #802 — Next.js's
  file-tracing omits the `@bull-board/ui` static assets from the standalone output; the
  maintainer's answer is manual copying, no package-side fix (closed 2024-12-06).
  (https://github.com/felixmosh/bull-board/issues/802)
- The old `bull-board` npm package is **deprecated** ("2.x is no longer supported, we moved to
  use @bull-board scope"), last published 5 years ago, yet still has ~31,623 weekly downloads.
  (https://www.npmjs.com/package/bull-board)

Summary: there is no runnable "point it at Redis" standalone product today — you must embed the
library in your own server process; containerized usage relies on unofficial community images.

## 4. Historical metrics — `@bull-board/metrics` is new and explicitly beta

- **Status: Beta**, stated verbatim in the package README: "The API and Redis storage layout
  may still change in a minor release while the feature settles. It is safe to run (opt-in, and
  it only writes its own namespaced keys), but pin an exact version if you depend on the storage
  format." (https://raw.githubusercontent.com/felixmosh/bull-board/master/packages/metrics/README.md,
  https://www.npmjs.com/package/@bull-board/metrics)
- **It is brand new and iterating fast**: first published 2026-07-23; 9 versions in ~3 weeks
  (0.0.0, 8.2.0 → 8.6.1); 0 npm dependents; ~967 weekly downloads.
  (https://registry.npmjs.org/@bull-board/metrics, https://www.npmjs.com/package/@bull-board/metrics)
- **What it does**: `MetricsRecorder` (runs in your own always-on process) snapshots BullMQ's
  native per-minute completed/failed counters into Redis buckets at three resolutions
  (minute 7d, hour 90d, day 90d retentions), plus wait-time/run-time latency histograms and a
  queue-age gauge; `RedisMetricsHistoryProvider` feeds the board's history charts, adding a
  "Metrics history" page (cross-queue) and 7d/30d/90d range selectors on per-queue charts.
  (https://raw.githubusercontent.com/felixmosh/bull-board/master/website/docs/recipes/historical-metrics.md)
- **What it does NOT do** (all from the same recipe, "Scope" section):
  - **BullMQ only** — "Bull v3 has no native metrics to snapshot".
  - Only completed/failed throughput + wait/run latency + queue age are tracked;
    **"there's no history for other job states or for job data itself."**
  - The **built-in UI reads daily rollups only**; hourly granularity is available on the
    `/api/metrics/history` endpoint for custom consumers, "though the built-in charts and the
    Metrics history page don't use it."
  - Requires **workers with native metrics enabled** (`metrics: { maxDataPoints: MetricsTime.ONE_WEEK }`)
    for counters, or charts render empty.
  - **`removeOnComplete: true` ⇒ no latency data ever** for that queue ("There's no error and
    no warning, just an empty chart").
  - Percentiles are **estimates** bounded by bucket width; the bucket layout is **fixed, not
    configurable**.
  - Requires an always-on recorder process (no singleton/leader election; safe to run in
    several processes, but you must run it somewhere).
  - `ioredis` peer dependency (v5/v6) with a same-copy requirement (a Redis client from a
    different ioredis install is misread as options).
  - Storage is Redis (`bull-board:metrics:` namespace) — the metrics package does not offer
    PostgreSQL storage, even though bull-board itself supports BullMQ v6 Postgres-backed queues.
  (https://raw.githubusercontent.com/felixmosh/bull-board/master/website/docs/recipes/historical-metrics.md,
  https://raw.githubusercontent.com/felixmosh/bull-board/master/packages/metrics/README.md)

Summary: metrics history exists but is young (beta, storage format unpinned), BullMQ-only,
counters+latency only (no per-job data history, no other states), daily-granularity in the
shipped UI, and depends on an external recorder process plus BullMQ native metrics config.

## 5. Secondary gaps worth noting

- **Granular permissions**: #780 "Feature Request: Granual permission job system" (open since
  2024-06-26) — per-user CRUD control over view/create/delete/retry/pause/clear. The maintainer
  added a queue **visibility guard** in Jul 2025, but job-level permission roles remain open.
  (https://github.com/felixmosh/bull-board/issues/780)
- **Failure triage at volume**: #1291 "Feature: group failed jobs by error for easier triage"
  (open since 2026-07-27) — flat paginated failed list; proposer notes "2,000 failures are
  really just 3 distinct errors"; maintainer asked "How would you group it?" — no implementation.
  (https://github.com/felixmosh/bull-board/issues/1291)
- **NestJS**: #649 "Error with registerQueueAsync in NestJs" (open, `bug` + `help wanted`) —
  `BullBoardModule.forFeature` fails when queues are registered asynchronously.
  (https://github.com/felixmosh/bull-board/issues/649)
- **Consistency bug**: #294 "clean all delayed jobs can finish on inconsistent state" (open since
  2021) — cleaning delayed jobs does not remove repeatable counterparts.
  (https://github.com/felixmosh/bull-board/issues/294)
- **UX requests open**: #264 "set default tab in BullAdapter settings" (2021),
  #1276 "support custom icon for miscLinks" (whitelabel-ish),
  #1329 "move the schedulers button" (cosmetic),
  #1293 "design-token theming and Base UI component migration (whitelabel support)" (2026-07),
  #1097 "run CI against earlier/multiple bullmq version(s)".
  (https://github.com/felixmosh/bull-board/issues/264,
  https://github.com/felixmosh/bull-board/issues/1276,
  https://github.com/felixmosh/bull-board/issues/1329,
  https://github.com/felixmosh/bull-board/issues/1293,
  https://github.com/felixmosh/bull-board/issues/1097)
- **Recently added (so NOT gaps)**: connected-workers visibility per queue landed Jul 2026
  (handler `queueWorkers.ts`, docs section "Connected workers"; #1292 closed 2026-07-30) — with
  the caveat that Redis providers blocking `CLIENT LIST` (Google Memorystore) get no worker info.
  A Schedulers view (list/edit/remove job schedulers) also exists per the docs.
  (https://raw.githubusercontent.com/felixmosh/bull-board/master/packages/api/src/handlers/queueWorkers.ts,
  https://raw.githubusercontent.com/felixmosh/bull-board/master/website/docs/guide/exploring-the-dashboard.md,
  https://github.com/felixmosh/bull-board/issues/1292)

## 6. Bottom line

| Area | Gap |
| --- | --- |
| Job search | No job search/filter at all; most-requested feature since 2020; blocked on bullmq's unmerged search PR (#3538); maintainer rejects Redis poking and client-side filtering |
| Flow visualization | Per-job tree exists; no queue-level graph; Flow support incomplete (waiting-children/parent links, #277 open since 2021) |
| Standalone mode | None officially — embeddable library only; no Docker image; community images only; Next.js standalone output misses UI assets |
| Historical metrics | Exists but beta (2026-07, API/storage unpinned), BullMQ-only, completed/failed+latency only, daily-granularity charts, needs external recorder + worker metrics config |

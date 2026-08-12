# Research: BullMQ v6 API surface a dashboard can expose

Resolves issue #3 ("Research: BullMQ v6 API surface a dashboard can expose"), part of the map issue #1.

## Scope and sources

- Version pinned to **BullMQ v6.1.0** — the latest release at research time (published 2026-08-12), per https://github.com/taskforcesh/bullmq/releases/latest (tag `v6.1.0`). `master` was at 6.0.10 at research time (package.json on `master`: https://github.com/taskforcesh/bullmq/blob/master/package.json).
- Primary sources: BullMQ source code at tag `v6.1.0` (https://github.com/taskforcesh/bullmq, files under `src/classes`, `src/interfaces`, `src/types`, `src/enums`) and the official docs (https://docs.bullmq.io, whose Markdown lives in `docs/gitbook` in the same repo).
- Note: the GitHub branch named `v6` is stale (its package.json says 5.34.2); the v6 line lives on `master`/tags. This doc cites `v6.1.0` file paths.

## 1. Queue: read side (`QueueGetters`)

Source: `src/classes/queue-getters.ts` @ v6.1.0
(https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/classes/queue-getters.ts)

### Job querying and pagination

- `getJob(jobId)` — single job or `undefined` (queue-getters.ts:36).
- `getJobs(types?, start = 0, end = -1, asc = false)` — returns `Job[]`; `types` can be a single state or array; defaults to all states (`active`, `completed`, `delayed`, `failed`, `prioritized`, `waiting`, `waiting-children`) (queue-getters.ts:489-525, 65-83).
- **Pagination is offset-based** (`start`/`end` indices), not cursor-based. Per-state convenience getters delegate to it: `getWaiting(start, end)`, `getActive(...)`, `getDelayed(...)`, `getPrioritized(...)`, `getWaitingChildren(...)`, `getCompleted(start, end)` (descending), `getFailed(start, end)` (queue-getters.ts:343-400).
- `getRanges(types, start, end, asc)` — raw job IDs from the Redis lists/zsets per state (queue-getters.ts:446-480).
- `getJobLogs(jobId, start, end, asc)` → `{ logs: string[], count: number }` — paginated job logs (queue-getters.ts:534-541).
- `getDependencies(parentId, 'processed'|'pending', start, end)` → `{ items, jobs: JobJson[], total }` — paginated child dependencies of a parent job (queue-getters.ts:419-444).
- **There is no native search/filter by job name, data payload, or timestamp range** — `getJobs` only pages through state sets; filtering requires client-side scans. Confirmed by the absence of any such method in queue-getters.ts.

### Counts and state

- `getJobCounts(...types)` → `{ [state]: number }`; `getJobCountByTypes(...types)` → sum; `count()` → waiting-ish total (`waiting`+`delayed`+`prioritized`+`waiting-children`) (queue-getters.ts:89-98, 171-194).
- Named counters: `getCompletedCount`, `getFailedCount`, `getDelayedCount`, `getActiveCount`, `getPrioritizedCount`, `getWaitingCount`, `getWaitingChildrenCount` (queue-getters.ts:275-336).
- `getCountsPerPriority(priorities)` (queue-getters.ts:310-322).
- `getJobState(jobId)` → `JobState | 'unknown'` (queue-getters.ts:229-231). `JobState = FinishedStatus | 'active' | 'delayed' | 'prioritized' | 'waiting' | 'waiting-children'`, where `FinishedStatus = 'completed' | 'failed'` (`src/types/job-type.ts`, `src/types/finished-status.ts` @ v6.1.0).

### Workers, meta, metrics

- `getWorkers()` → array of objects from Redis `CLIENT LIST` filtered by BullMQ client names; `getWorkersCount()` (queue-getters.ts:570-602). Doc note in source: GCP memorystore does not support `SETNAME`, so this fails there.
- `getQueueEvents()` — exists but `@deprecated`, "will be removed in the future" (queue-getters.ts:604-619).
- `getMetrics(type: 'completed'|'failed', start = 0, end = -1)` — see Metrics section (queue-getters.ts:635-651).
- `exportPrometheusMetrics(globalVariables?)` — Prometheus text-exposition string: `bullmq_job_count{queue,state}` gauge + `bullmq_job_completed_total` / `bullmq_job_failed_total` counters (queue-getters.ts:684-734; guide: https://docs.bullmq.io/guide/metrics/prometheus).
- `getMeta()` (queue metadata hash: paused, concurrency, rate limit, version), `getVersion()`, `getGlobalConcurrency()`, `getGlobalRateLimit()`, `getRateLimitTtl()`, `getDeduplicationJobId()` (queue-getters.ts:108-270).

## 2. Queue: mutating side (`Queue`)

Source: `src/classes/queue.ts` @ v6.1.0
(https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/classes/queue.ts)

Job lifecycle / destructive operations a dashboard might expose:

- `add(name, data, opts)`, `addBulk(jobs[])` (queue.ts:314-439).
- `pause()` / `resume()` / `isPaused()` (queue.ts:495-552).
- `remove(jobId, { removeChildren = true })` → 1 or 0 (queue.ts:674-696).
- `retryJobs({ count?, state?: 'failed'|'completed', timestamp? })` — bulk retry of failed (default) or completed jobs (queue.ts:867-889).
- `promoteJobs({ count? })` — bulk promote all delayed jobs (queue.ts:899-915).
- `clean(grace, limit, type)` — remove jobs older than grace ms; types: `completed | wait | waiting | active | paused | prioritized | delayed | failed` (queue.ts:771-824).
- `drain(delayed?)` — remove waiting (and optionally delayed) jobs, not active/completed/failed (queue.ts:746-759).
- `obliterate({ force?, count? })` — irreversibly destroy the queue and all contents; pauses first; requires no active jobs unless `force` (queue.ts:837-855).
- `updateJobProgress(jobId, progress)`, `addJobLog(jobId, logRow, keepLogs?)` (queue.ts:704-737).
- `trimEvents(maxLength)` — trim the event stream (queue.ts:922-935).
- `rateLimit(expireTimeMs)`, `removeRateLimitKey()`, `setGlobalConcurrency(n)`, `setGlobalRateLimit(max, duration)`, `removeGlobalConcurrency()`, `removeGlobalRateLimit()` (queue.ts:273-298, 518-531, 661-663).
- Job schedulers (v5.18+/v6): `upsertJobScheduler(id, repeatOpts, jobTemplate?)`, `getJobScheduler(id)`, `getJobSchedulers(start?, end?, asc?)`, `getJobSchedulersCount()`, `removeJobScheduler(id)` (queue.ts:455-615).
- `removeDeduplicationKey(id)` (deduplication/debounce cleanup) (queue.ts:643-656).
- `removeOrphanedJobs(count = 1000, limit = 0)` — one-time migration helper for a specific v5.66.6 regression (#3694); "not needed" under normal operation (queue.ts:944-969).

Queue (local instance) events: `waiting`, `progress`, `cleaned`, `removed`, `paused`, `resumed`, `error` (queue.ts:39-90).

### Job-level methods

Source: `src/classes/job.ts` @ v6.1.0
(https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/classes/job.ts)

- Read: `getState()`, `isCompleted/isFailed/isDelayed/isActive/isWaiting/isWaitingChildren()`, `getDependencies()`, `getDependenciesCount()`, `getFailedChildrenValues()`, `getIgnoredChildrenFailures()`, `waitUntilFinished()`, `toJSON()/asJSON()`, plus properties `id, name, data, opts, returnvalue, failedReason, progress, timestamp, attemptsMade, processedOn, finishedOn, stacktrace` (job.ts).
- Mutating: `updateData()`, `updateProgress()`, `log()`, `remove()`, `retry()`, `promote()`, `changeDelay()`, `changePriority()`, `moveToCompleted()`, `moveToFailed()`, `moveToWait()`, `moveToDelayed()`, `moveToWaitingChildren()`, `removeChildDependency()`, `removeUnprocessedChildren()`, `clearLogs()`, `extendLock()` (job.ts).

## 3. QueueEvents: live event stream

Source: `src/classes/queue-events.ts` @ v6.1.0
(https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/classes/queue-events.ts)

Events emitted (queue-events.ts:12-244):

| Event | Payload | Notes |
|---|---|---|
| `added` | `{ jobId, name }` | job created |
| `waiting` | `{ jobId, prev? }` | |
| `delayed` | `{ jobId, delay }` | delay parsed to number |
| `active` | `{ jobId, prev? }` | processing started |
| `progress` | `{ jobId, data }` | `data` JSON-parsed |
| `completed` | `{ jobId, returnvalue, prev? }` | returnvalue JSON-parsed |
| `failed` | `{ jobId, failedReason, prev? }` | |
| `retries-exhausted` | `{ jobId, attemptsMade }` | attemptsMade is a string |
| `stalled` | `{ jobId }` | lock lost, moved back |
| `waiting-children` | `{ jobId }` | flow parent |
| `deduplicated` | `{ jobId, deduplicationId, deduplicatedJobId }` | |
| `duplicated` | `{ jobId }` | jobId already existed |
| `removed` | `{ jobId, prev }` | |
| `cleaned` | `{ count }` | count is a string |
| `paused` / `resumed` | `{}` | |
| `drained` | (id only) | waiting list empty |
| `error` | `Error` | Redis errors |

Implementation details (queue-events.ts:336-402):

- Consumes the queue's Redis **stream** (`XREAD` blocking) on a dedicated Redis connection; `blockingTimeout` defaults to 10000 ms.
- Every event is also re-emitted suffixed per job: `` `${event}:${jobId}` `` (queue-events.ts:395-397) — useful for per-job live views.
- Constructor options: `autorun = true` (start consuming immediately), `lastEventId` (resume from a known stream ID instead of `$`), `blockingTimeout` (`src/interfaces/queue-options.ts` @ v6.1.0, QueueEventsOptions).
- The event stream is capped: default max length **10,000 events** (`Queue.metaValues`, `opts.streams.events.maxLen`, queue.ts:230-235) — history older than that is gone unless trimmed/extended.
- A separate `QueueEventsProducer` exists to publish custom events (guide: https://docs.bullmq.io/guide/events/create-custom-events; class `src/classes/queue-events-producer.ts` @ v6.1.0).

`Worker` also emits local events (`completed`, `failed`, `progress`, `active`, `stalled`, `drained`, `paused`, `resumed`, `closing`, `closed`, `error`, `lockRenewalFailed`, `locksRenewed`, `ready` — `src/classes/worker.ts` @ v6.1.0:54-174), but `QueueEvents` is the global, queue-wide mechanism a dashboard listens to.

## 4. Flows: FlowProducer and getFlow

Source: `src/classes/flow-producer.ts` @ v6.1.0
(https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/classes/flow-producer.ts)
Guide: https://docs.bullmq.io/guide/flows/get-flow-tree

- `FlowProducer.add(flow: FlowJob, opts?)` → `JobNode { job: Job, children?: JobNode[] }` — atomic add of a tree of jobs; children run before parents; jobs may span **different queues** (flow-producer.ts:211-270, 95-104).
- `FlowProducer.addBulk(flows)` → `JobNode[]` (flow-producer.ts:310-354).
- `FlowProducer.getFlow({ queueName, id, depth = 10, maxChildren = 20, prefix? })` → `JobNode` tree — **this is the "get flow tree" capability**; the docs guide title is "Get Flow Tree" but the method is `getFlow` (there is no method named `getFlowTree` in v6.1.0 — the guide page https://docs.bullmq.io/guide/flows/get-flow-tree itself links to `getFlow`).
- `getFlow` walks children recursively via `Job.getDependencies`, covering processed, unprocessed, failed and ignored children, each capped by `maxChildren` per node and `depth` levels (flow-producer.ts:512-558).
- `close()`, `disconnect()`, `waitUntilReady()`, `getBackend()` (flow-producer.ts:184-199, 667-680).

## 5. Metrics

Sources: `src/classes/queue-getters.ts` (getMetrics), `src/interfaces/metrics.ts`, `src/interfaces/metrics-options.ts`, `src/enums/metrics-time.ts` @ v6.1.0; guide https://docs.bullmq.io/guide/metrics

Native metrics (OSS):

- **Collected by workers**, opt-in via `Worker` option `metrics: { maxDataPoints }` — workers count jobs processed **per minute** (completed and failed) and store counters in Redis lists (guide Metrics; `MetricsOptions.maxDataPoints` in `src/interfaces/metrics-options.ts` @ v6.1.0).
- Read via `queue.getMetrics('completed' | 'failed', start = 0, end = -1)` → `{ meta: { count, prevTS, prevCount }, data: number[], count }` (queue-getters.ts:635-651; `src/interfaces/metrics.ts` @ v6.1.0).
  - `data[i]` = number of jobs completed (or failed) in the i-th minute bucket; `start`/`end` support pagination.
  - `meta.count` = **total** completed/failed since the queue started processing, not just the queried interval (guide Metrics).
- `MetricsTime` enum: ONE_MINUTE..ONE_MONTH values (1, 5, 15, 30, 60, 10080, 20160, 40320) (`src/enums/metrics-time.ts` @ v6.1.0).
- **Historical persistence is bounded**: only completed/failed per-minute buckets, and the oldest data points are disposed automatically once `maxDataPoints` is exceeded (guide Metrics). There is **no native history for waiting/delayed states, no latency percentiles, no per-job duration series** in Redis.
- Prometheus export: `exportPrometheusMetrics()` (see §1).

## 6. Telemetry (OSS vs Pro)

Sources: `src/interfaces/telemetry.ts`, `src/enums/telemetry-attributes.ts` @ v6.1.0; guides https://docs.bullmq.io/guide/telemetry and https://docs.bullmq.io/bullmq-pro/telemetry

- **Telemetry is available in OSS BullMQ.** Queue, Worker and FlowProducer accept a `telemetry?: Telemetry` option (`QueueBaseOptions.telemetry`, `WorkerOptions.telemetry` — `src/interfaces/queue-options.ts`, `src/interfaces/worker-options.ts` @ v6.1.0).
- `Telemetry` = `{ tracer, contextManager, meter? }` — a provider-agnostic interface "heavily inspired by OpenTelemetry" (`src/interfaces/telemetry.ts` @ v6.1.0:3-35). Reference implementation: the `bullmq-otel` package (guide Telemetry getting started).
- OSS telemetry records spans for operations like `add`, `addBulk`, `addFlow`, `processJob` with attributes (job id/name, queue name, etc.) via `TelemetryAttributes` (`src/enums/telemetry-attributes.ts` @ v6.1.0; queue.ts:319-340).
- OSS telemetry **metrics** (via `BullMQOtel({ enableMetrics: true })`): counters `bullmq.jobs.completed`, `bullmq.jobs.failed`, `bullmq.jobs.delayed`, `bullmq.jobs.retried`, `bullmq.jobs.waiting`, `bullmq.jobs.waiting_children`; histogram `bullmq.job.duration` (ms); gauge `bullmq.queue.jobs` recorded by `queue.recordJobCountsMetric()` (guide https://docs.bullmq.io/guide/telemetry/metrics; queue-getters.ts:202-220).
- **BullMQ Pro** does not gate telemetry: "In the same fashion we support telemetry in BullMQ open source edition, we also support telemetry for BullMQ Pro" — same integrations (`BullMQOtel`) on `QueuePro`/`WorkerPro` (https://docs.bullmq.io/bullmq-pro/telemetry).
- Pro-only features (relevant only if a dashboard must handle Pro queues): Observables, Groups, Batches, group rate limits (https://docs.bullmq.io/bullmq-pro/introduction; feature comparison table in README https://github.com/taskforcesh/bullmq#feature-comparison). Metrics/telemetry/events/flows described above are OSS.

## 7. Read-only vs mutating summary

Read-only (safe for a dashboard to call freely):

- `getJob`, `getJobs` + per-state getters, `getRanges`, `getJobCounts`/`getJobCountByTypes`/`count`/named counts, `getCountsPerPriority`, `getJobState`, `getJobLogs`, `getDependencies`/`getDependenciesCount`, `getWorkers`/`getWorkersCount`, `getMetrics`, `exportPrometheusMetrics`, `getMeta`/`getVersion`/`getGlobalConcurrency`/`getGlobalRateLimit`/`getRateLimitTtl`, `getJobScheduler(s)`, `isPaused`, `isMaxed`, `Job.getState()` and `is*` checks, `FlowProducer.getFlow`, `QueueEvents` subscription.

Mutating (dashboard "actions" — need auth/guardrails):

- Queue: `add`, `addBulk`, `pause`, `resume`, `remove`, `retryJobs`, `promoteJobs`, `clean`, `drain`, `obliterate`, `updateJobProgress`, `addJobLog`, `trimEvents`, `rateLimit`/`removeRateLimitKey`, `setGlobalConcurrency`/`setGlobalRateLimit`/removers, `upsertJobScheduler`/`removeJobScheduler`, `removeDeduplicationKey`, `removeOrphanedJobs`.
- Job: `retry`, `promote`, `remove`, `changeDelay`, `changePriority`, `updateData`, `updateProgress`, `log`, `clearLogs`, `moveTo*`, `removeChildDependency`, `removeUnprocessedChildren`.

## 8. What BullMQ v6 does NOT provide natively (dashboard gaps)

- **No queue discovery/listing API** — no `getQueues()`/registry in v6.1.0 (verified against the v6.1.0 file tree; a `feat/add-queue-registry-support` branch exists on GitHub but is not in the release).
- **No job search/filtering** by name, data, or timestamp — only offset pagination per state; full scans are client-side.
- **No streaming transport** — QueueEvents is a Node.js EventEmitter over a Redis stream; a web dashboard must bridge it itself (WebSocket/SSE).
- **Bounded history everywhere** — event stream defaults to 10,000 entries; metrics bounded by `maxDataPoints`; completed/failed job retention governed by worker `removeOnComplete`/`removeOnFail` (https://docs.bullmq.io/guide/workers/auto-removal-of-jobs).
- **Worker info is derived from Redis CLIENT LIST** — fragile on managed Redis without `SETNAME` (e.g. GCP), per source note in queue-getters.ts:573.
- **Metrics cover only completed/failed per-minute** — no state-duration, latency, or throughput series beyond that; richer telemetry requires wiring OTel (OSS) separately.

## 9. Pro vs OSS quick reference

| Capability | OSS v6 | Pro |
|---|---|---|
| Queue/Worker/QueueEvents/FlowProducer core API | ✓ | ✓ (Pro subclasses) |
| `getFlow` / flow trees | ✓ | ✓ |
| Native metrics (per-minute completed/failed) | ✓ | ✓ |
| Prometheus export | ✓ | ✓ |
| Telemetry interface + bullmq-otel | ✓ | ✓ |
| Groups, Batches, Observables, group rate limit | — | ✓ only |

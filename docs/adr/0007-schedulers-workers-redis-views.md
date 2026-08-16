# Schedulers, workers and Redis stats mirror bull-board's routes; scheduler creation is an additive route

The remaining parity views in bullmq-dash v1 (issue #30) mirror bull-board v8's route table: `GET /api/job-schedulers` (optional `queueName` query) lists every repeatable job tagged with its queue; `GET /api/queues/:queueName/workers` answers `{ workers: QueueWorker[] | null }` where `null` means "could not ask" (unreachable queue) rather than "nobody is there"; `GET /api/redis/stats` parses the first queue's Redis `INFO` with the `redis-info` package (bull-board's own dependency) into `{ backend, version, mode, port, os, uptime, memory, clients }`. Scheduler edits mirror bull-board too: `PATCH /api/queues/:queueName/job-schedulers/:schedulerId` rewrites only the schedule (pattern or every, plus optional tz/limit/endDate) and `PUT /api/queues/:queueName/job-schedulers/:schedulerId/remove` removes — 404 on unknown ids, 204 on success.

**Scheduler creation** is the one place bull-board offers nothing to mirror (its Schedulers page lists, edits and removes only), so the ticket's add requirement gets its own route: `POST /api/queues/:queueName/job-schedulers` with `{ id, repeat, jobTemplate? }`, mapped to BullMQ's `upsertJobScheduler(id, repeat, jobTemplate)` — the v6 API that is itself an upsert, so create and update share one underlying seam. The handler validates the same schedule shape as the PATCH route and answers `201 { scheduler }` with the stored scheduler re-read through the adapter's list.

**readOnly** gates all three scheduler mutations through the shared `mutationQueue` precondition (ADR-0004): the board-level `readOnly` option and the per-queue `readOnlyMode` both answer 403, and the queues response's `readOnlyMode` flag hides the add/edit/remove controls in the UI. The two read endpoints stay ungated; the workers endpoint answers 403 only when `uiConfig.showWorkers === false` (the config flag that also hides the queue listing's worker hint), and the Redis stats endpoint answers 403 under `hideRedisDetails`, `{}` when no queue is registered, and 404 when the queue is not Redis-backed — bull-board's Postgres datastore stats are out of v1.

**Scheduler runs** (next/last run columns) are derived the way bull-board derives them, from the job ids BullMQ generates — `repeat:<schedulerId>:<scheduled millis>`: the pending job at `scheduler.next` is the next run, its `timestamp` is when the previous run started (BullMQ creates the job the moment the prior run moves to active), and the previous run's id follows from `next - every` for interval schedules. An `iterationCount` of 1 means the app's own upsert, not a run, so no last run is claimed.

**UI**: the queue header's per-view buttons become a persistent tab strip (`QueueNav`: Jobs, Schedulers, Workers, Redis, Flow, Metrics — Metrics hidden when `uiConfig.showMetrics === false`), rendered by every queue view so navigation stays put. The schedulers view adds an inline add/edit form (id, interval or cron, tz, limit, end date, job name, JSON data) with client-side validation mirroring the server's, and confirm-gated remove; the workers view lists name/address/connected-for; the Redis view renders the stats as calm stat panels. All three views fetch on mount with a manual refresh rather than polling — the numbers change slowly and the queue listing already carries the worker hint on its own interval.

## Considered Options

- **Mirror bull-board's route shapes exactly** — adopted: the drop-in migration story (ADR-0001) extends to these endpoints; only the add route is additive.
- **A per-queue `GET /api/queues/:queueName/job-schedulers`** — rejected: the UI scopes the cross-queue `GET /api/job-schedulers` with its `queueName` query instead, keeping the route table at bull-board parity.
- **Add through the job-add form (`options.repeat`)** — rejected: BullMQ v6's repeat path runs through `upsertJobScheduler`; a legacy repeat options field would bypass the scheduler registry the views read from.
- **Postgres datastore stats** — rejected for v1: only Redis is in scope, matching the research; the 404 keeps the door open.
- **Polled schedulers/workers lists** — rejected: unlike job lists these answers change on operator action, not on queue traffic; manual refresh keeps the dashboard quiet.

## Consequences

- The route table registers `/api/job-schedulers`, `/api/redis/stats`, `/api/queues/:queueName/workers` and the three `job-schedulers` mutation routes before the `:jobId` routes, so the literal segments win over being read as a job id (ADR-0003's ordering rule).
- `BaseAdapter` gains `getJobSchedulers()`, `removeJobScheduler()`, `updateJobScheduler()` (+ `supportsJobSchedulerUpdate`), `getRedisInfo()` and a default `addJobScheduler()` answering `not-supported` (405) — additive to the drop-in adapter shape, with `BullMQAdapter` the only implementation.
- `redis-info` joins the API package as a runtime dependency — the same dependency bull-board's own `redisStats` handler carries.
- BullMQ v6 places a scheduler's first job in `waiting` (it fires immediately), which the readOnly integration test accounts for when asserting nothing was drained.

# Diagnostic Evidence Without Instrumentation

## Scope and Verdict

This report answers what the current bullmq-dash code can say about a BullMQ
job without changing an application worker or adding a new per-job telemetry
layer. The repository is pinned to BullMQ `6.1.0` in
[`pnpm-lock.yaml:45-47`](../../pnpm-lock.yaml#L45-L47). The source links below
pin the BullMQ `v6.1.0` tag; the API-guide links are the official BullMQ v6
documentation.

**Verdict:** alpha.3 can credibly promise a current, retained BullMQ snapshot;
the latest retained outcome; a cumulative attempt count; a last-attempt timing
calculation when the relevant fields still exist; currently connected workers;
current, bounded Flow topology; BullMQ log rows that the application wrote and
has not trimmed; and coarse per-minute queue aggregates. It cannot promise an
event-sourced debugger that reconstructs every state transition, attempt,
worker, delay, dependency outcome, or removed job.

That boundary follows from three facts:

- Job detail is one `Queue.getJob` snapshot plus one current `Job.getState`
  lookup. [`packages/api/src/handlers/job.ts:10-27`](../../packages/api/src/handlers/job.ts#L10-L27)
- The dashboard's timing capture joins events in an in-process map and writes
  minute aggregates, not per-job records. [`packages/api/src/metrics/capture.ts:22-33`](../../packages/api/src/metrics/capture.ts#L22-L33)
  [`packages/api/src/metrics/capture.ts:35-79`](../../packages/api/src/metrics/capture.ts#L35-L79)
- BullMQ's job hash and state collections are mutable, while finalized jobs,
  logs, dependencies, and the event stream can be removed or trimmed. See
  BullMQ's [`JobJson` definition](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/interfaces/job-json.ts),
  [`moveToFinished-14.lua`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/commands/moveToFinished-14.lua),
  [`removeJobKeys.lua`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/commands/includes/removeJobKeys.lua),
  and the official [auto-removal guide](https://docs.bullmq.io/guide/queues/auto-removal-of-jobs).

## Evidence Model

### Retained Job Snapshot

`formatJob` serializes the BullMQ `Job` object and currently serves the job id,
name, creation timestamp, optional `processedOn`, optional `processedBy`,
optional `finishedOn`, progress, `attemptsMade` under the API field `attempts`,
delay, options, data, return value, failure reason, and stacktrace. It reverses
the stored stacktrace rows before returning them. [`packages/api/src/handlers/queues.ts:15-38`](../../packages/api/src/handlers/queues.ts#L15-L38)
The wire type confirms the exposed subset. [`packages/api/src/typings/app.ts:129-150`](../../packages/api/src/typings/app.ts#L129-L150)

BullMQ's stored `JobJson` also has `attemptsStarted`, `stalledCounter`,
`priority`, `parent`, `parentKey`, `repeatJobKey`, deduplication/deferred-failure
fields, and `processedBy`. The current `AppJob` contract does not expose most of
those as dedicated fields. [`packages/api/src/typings/app.ts:129-150`](../../packages/api/src/typings/app.ts#L129-L150)
Official definitions: [`JobJson`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/interfaces/job-json.ts)
and the [BullMQ Job API](https://docs.bullmq.io/api/classes/v6.Job.html).

The API has more evidence than the detail page renders. The UI shows progress,
`attempts`, and the original `timestamp`, then data, options, failure reason,
and stacktrace; it does not render `processedOn`, `finishedOn`, `processedBy`,
delay, or the return value. [`packages/ui/src/queues/JobDetail.tsx:75-110`](../../packages/ui/src/queues/JobDetail.tsx#L75-L110)

### Current State Collections

The adapter reads BullMQ's current per-state collections through
`Queue.getJobs`, and the detail route separately asks `Job.getState`. [`packages/api/src/queueAdapters/bullMQ.ts:70-95`](../../packages/api/src/queueAdapters/bullMQ.ts#L70-L95)
[`packages/api/src/handlers/queueJobs.ts:23-44`](../../packages/api/src/handlers/queueJobs.ts#L23-L44)
BullMQ documents `getJobs` as a paginated read of jobs in the requested status
and `getState` as the current state lookup, not a lifecycle history: [getters
guide](https://docs.bullmq.io/guide/jobs/getters),
[Queue API `getJobs`](https://docs.bullmq.io/api/classes/v6.Queue.html#getjobs),
and [Job API `getState`](https://docs.bullmq.io/api/classes/v6.Job.html#getstate).

BullMQ v6 has `active`, `waiting`, `waiting-children`, `prioritized`,
`completed`, `failed`, and `delayed` states. The adapter also supplies a
presentation-only `paused` state. [`packages/api/src/constants/statuses.ts:3-20`](../../packages/api/src/constants/statuses.ts#L3-L20)
[`packages/api/src/queueAdapters/bullMQ.ts:385-401`](../../packages/api/src/queueAdapters/bullMQ.ts#L385-L401)
In v6 a paused queue's jobs remain in the waiting representation; the adapter
maps that representation to `paused` only when the queue is paused. [`packages/api/src/queueAdapters/bullMQ.ts:56-59`](../../packages/api/src/queueAdapters/bullMQ.ts#L56-L59)
[`packages/api/src/queueAdapters/bullMQ.ts:74-112`](../../packages/api/src/queueAdapters/bullMQ.ts#L74-L112)
This proves the current state and queue pause flag, not when the queue was
paused or how long a job spent there.

### QueueEvents Capture

`createBullBoard` automatically attaches `MetricsCapture` to every watched
queue that can provide a Redis client. [`packages/api/src/index.ts:49-96`](../../packages/api/src/index.ts#L49-L96)
The capture listens only for `waiting`, `added`, `active`, `completed`, and
`failed`; it does not persist the event payload, previous state, event id, or a
per-job event list. [`packages/api/src/metrics/capture.ts:91-129`](../../packages/api/src/metrics/capture.ts#L91-L129)
BullMQ exposes a wider event vocabulary including `delayed`, `stalled`,
`retries-exhausted`, `removed`, `progress`, and `waiting-children` in the
official [`QueueEventsListener`](https://docs.bullmq.io/api/interfaces/v6.QueueEventsListener.html)
and [`src/classes/queue-events.ts`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/classes/queue-events.ts).

BullMQ's `QueueEvents` consumer starts at the live stream tail when no
`lastEventId` is supplied, and BullMQ trims the queue event stream to its
configured approximate maximum. See the consumer in
[`src/classes/queue-events.ts`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/classes/queue-events.ts)
and [`trimEvents.lua`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/commands/includes/trimEvents.lua).
The dashboard therefore cannot replay events that happened before it attached,
and a restart loses the in-memory timing pairs. The integration tests
deliberately warm up the subscription before measuring it, documenting this
startup window. [`packages/api/src/metrics/capture.spec.ts:88-104`](../../packages/api/src/metrics/capture.spec.ts#L88-L104)

### Aggregate Metrics

The existing dashboard-owned store writes one auto-expiring Redis hash per queue
per minute. The default retention is seven days. [`packages/api/src/metrics/store.ts:3-18`](../../packages/api/src/metrics/store.ts#L3-L18)
[`packages/api/src/metrics/store.ts:69-75`](../../packages/api/src/metrics/store.ts#L69-L75)
The store holds completed/failed counts and sums/counts for event-derived wait
and duration averages; it has no job id or attempt dimension. [`packages/api/src/metrics/store.ts:19-26`](../../packages/api/src/metrics/store.ts#L19-L26)

Counts can be filled from BullMQ's native per-minute metrics while the board was
down, but only when the worker was already configured with native metrics. The
code explicitly treats the native source as empty without that opt-in. [`packages/api/src/metrics/native.ts:19-25`](../../packages/api/src/metrics/native.ts#L19-L25)
[`packages/api/src/handlers/metrics.ts:60-76`](../../packages/api/src/handlers/metrics.ts#L60-L76)
BullMQ records those counters from the worker's `metrics.maxDataPoints` path in
[`moveToFinished-14.lua`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/commands/moveToFinished-14.lua)
and documents the queue metrics API at
[`Queue.getMetrics`](https://docs.bullmq.io/api/classes/v6.Queue.html#getmetrics).
Without pre-existing worker metrics, downtime loses both counts and timing
samples; the repository test demonstrates that native counts without capture
have no duration or wait averages. [`packages/api/src/handlers/metrics.spec.ts:122-191`](../../packages/api/src/handlers/metrics.spec.ts#L122-L191)

### What Raw Redis Adds

Direct Redis inspection can answer a few current-state questions that the
dashboard's public routes do not. The job hash, state lists/sorted sets, log
list, Flow dependency keys, active lock key, delayed sorted-set score, and
bounded event stream are BullMQ implementation data. Their existence can prove
current membership or current stored values at the instant of inspection, but
not a prior lifecycle after the key or stream entry has been removed. BullMQ's
[`QueueGetters`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/classes/queue-getters.ts),
[`JobJson`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/interfaces/job-json.ts),
and the command/include paths cited above own those representations.

The current dashboard does not provide a raw job-key or event-stream endpoint;
its Redis-specific endpoint reports server `INFO`, while its only additional
Redis writes are the dashboard metrics buckets. [`packages/api/src/handlers/redisStats.ts:5-33`](../../packages/api/src/handlers/redisStats.ts#L5-L33)
[`packages/api/src/metrics/store.ts:69-75`](../../packages/api/src/metrics/store.ts#L69-L75)
Therefore, raw Redis facts should be treated as operator/debugger evidence and
implementation-level caveats, not as current alpha.3 REST guarantees.

## Findings

### Lifecycle Facts

**A retained job can be inspected as a snapshot.** If `Queue.getJob` still finds
the job hash, bullmq-dash can return the current payload, name, options,
progress, cumulative `attemptsMade`, current failure data, return value, and
the persisted timestamps listed above; it can also report the current state or
`unknown`. [`packages/api/src/handlers/job.ts:17-27`](../../packages/api/src/handlers/job.ts#L17-L27)
[`packages/api/src/handlers/queues.ts:21-37`](../../packages/api/src/handlers/queues.ts#L21-L37)
BullMQ reconstructs these values from the job hash in
[`Job.fromJSON`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/classes/job.ts)
and its [Job API](https://docs.bullmq.io/api/classes/v6.Job.html).

**Current `waiting`, `active`, `prioritized`, and `waiting-children` facts are
available.** The state collections can prove that a job is in one of those
states at read time. `waiting-children` specifically represents a parent with
pending child dependencies in BullMQ. [`packages/api/src/queueAdapters/bullMQ.ts:84-112`](../../packages/api/src/queueAdapters/bullMQ.ts#L84-L112)
[`packages/api/src/providers/flow.ts:21-26`](../../packages/api/src/providers/flow.ts#L21-L26)
The UI's job tabs omit `waiting-children` and `prioritized`, although the API
status contract includes them. [`packages/ui/src/queues/QueueJobs.tsx:29-36`](../../packages/ui/src/queues/QueueJobs.tsx#L29-L36)
[`packages/api/src/typings/app.ts:9-20`](../../packages/api/src/typings/app.ts#L9-L20)

**An active snapshot carries last-start evidence, not active history.** BullMQ
writes `processedOn` when a job enters active and writes `processedBy` only when
the worker has a name. [`prepareJobForProcessing.lua`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/commands/includes/prepareJobForProcessing.lua)
The dashboard API preserves those optional fields, but a subsequent attempt or
stall overwrites the same scalar fields. [`packages/api/src/handlers/queues.ts:21-27`](../../packages/api/src/handlers/queues.ts#L21-L27)
No prior active start is retained by the current API.

**A retained completed job can prove its latest completion.** The completed
state, `returnValue`, `finishedOn`, last `processedOn`, progress, and
`attemptsMade` are available while the job remains in Redis. BullMQ's finish
script writes the final value and `finishedOn`, increments `attemptsMade`, and
adds the id to the completed set. [`moveToFinished-14.lua`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/commands/moveToFinished-14.lua)
The snapshot does not prove that the job succeeded on its first attempt: prior
failed attempts and manual retries can lead to the same final state.

**A retained failed job can prove its latest failure snapshot.** The failed
state, latest `failedReason`, final `finishedOn`, last `processedOn`, cumulative
`attemptsMade`, and stored stacktrace rows are available. BullMQ appends error
stacks subject to `stackTraceLimit`; the current formatter returns the retained
rows newest-first. [`packages/api/src/handlers/queues.ts:18-31`](../../packages/api/src/handlers/queues.ts#L18-L31)
[`src/classes/job.ts`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/classes/job.ts)
The stacktrace rows do not carry attempt ids or timestamps, so even multiple
rows cannot be reliably assigned to individual attempts.

**A missing job is not a reconstructable lifecycle state.** `getJob` returns no
snapshot after explicit removal, cleaning, obliteration, or auto-removal, and
the detail route returns 404. BullMQ's removal helper deletes the job hash,
logs, and dependency keys together. [`packages/api/src/handlers/job.ts:17-21`](../../packages/api/src/handlers/job.ts#L17-L21)
[`removeJobKeys.lua`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/commands/includes/removeJobKeys.lua)
BullMQ documents `removeOnComplete`/`removeOnFail` as deleting finalized jobs,
including lazily on a later finalization. [Auto-removal guide](https://docs.bullmq.io/guide/queues/auto-removal-of-jobs).
An aggregate count may survive in native or dashboard metrics, but it cannot be
joined back to the deleted job.

### Attempts and Retry Facts

**`attempts` means `attemptsMade`, not a complete attempt counter.** The API maps
only `job.toJSON().attemptsMade` to `AppJob.attempts`, and the UI renders that
number. [`packages/api/src/handlers/queues.ts:27-29`](../../packages/api/src/handlers/queues.ts#L27-L29)
[`packages/ui/src/queues/JobDetail.tsx:81-83`](../../packages/ui/src/queues/JobDetail.tsx#L81-L83)
BullMQ increments `attemptsMade` after a finished attempt and separately stores
`attemptsStarted`, incremented when the job enters active. [`src/classes/job.ts`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/classes/job.ts)
[`prepareJobForProcessing.lua`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/commands/includes/prepareJobForProcessing.lua)
Thus an active first attempt can show `attempts: 0`, while a job that has been
retried can have a cumulative count. `attemptsStarted` is available in BullMQ
but is dropped by the current `AppJob` formatter.

**Stalls are countable only if the raw job field is inspected, and not timed.**
BullMQ persists `stalledCounter` and increments it when a missing lock causes a
job to be moved from active back to waiting; the current formatter does not
serve that field. [`moveStalledJobsToWait-9.lua`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/commands/moveStalledJobsToWait-9.lua)
[`packages/api/src/typings/app.ts:129-150`](../../packages/api/src/typings/app.ts#L129-L150)
The current QueueEvents capture also ignores `stalled`, so it cannot supply
stall timestamps. BullMQ's [stalled jobs guide](https://docs.bullmq.io/guide/workers/stalled-jobs)
describes the move and the lock-renewal cause.

**Automatic retries preserve one job id but do not preserve a per-attempt
record.** BullMQ moves a failed job to waiting or delayed, increments the
attempt counter, and emits state events; backoff may be built-in or a worker
custom strategy. [Retrying failing jobs guide](https://docs.bullmq.io/guide/retrying-failing-jobs)
[`moveToDelayed-12.lua`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/commands/moveToDelayed-12.lua)
The current detail can show the cumulative count and the latest failure fields,
but not each attempt's start, finish, delay, worker, exception, or outcome.
`opts.backoff` may describe a built-in policy, but a custom strategy lives in
worker code and is not reconstructable from the job snapshot.

**Manual retry changes the evidence model.** bullmq-dash invokes `job.retry` for
completed or failed jobs without resetting counters. [`packages/api/src/handlers/jobActions.ts:14-28`](../../packages/api/src/handlers/jobActions.ts#L14-L28)
BullMQ's retry operation moves the same id back to waiting and clears
`failedReason` or `returnvalue`, `finishedOn`, and `processedOn`; optional reset
flags control the attempt counters. [`reprocessJob-8.lua`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/commands/reprocessJob-8.lua)
[`Job.retry` API](https://docs.bullmq.io/api/classes/v6.Job.html#retry)
The reprocess script does not clear the stored stacktrace. Because
`formatJob` sets `isFailed` when either a failure reason or a non-empty
stacktrace exists, a manually retried job can retain old failure evidence and
still be marked `isFailed` even though its current state is waiting. [`packages/api/src/handlers/queues.ts:30-36`](../../packages/api/src/handlers/queues.ts#L30-L36)
This is a reason not to promise that the snapshot distinguishes current from
historical failure after a retry.

**There is no reliable automatic-versus-manual retry label.** Both paths reuse
the same job id and current mutable fields. BullMQ's event vocabulary includes
previous-state values and `retries-exhausted`, but bullmq-dash neither stores
those events nor exposes them as history. [`packages/api/src/metrics/capture.ts:113-127`](../../packages/api/src/metrics/capture.ts#L113-L127)
[`QueueEventsListener`](https://docs.bullmq.io/api/interfaces/v6.QueueEventsListener.html)

### Timing Facts

**The retained fields have narrow meanings.** BullMQ defines `timestamp` as the
job creation time unless overridden by options, `processedOn` as the time it
was processed, and `finishedOn` as the final completion/failure time. [Job API
properties](https://docs.bullmq.io/api/classes/v6.Job.html)
[`JobJson`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/interfaces/job-json.ts)
For a retained final job, `finishedOn - processedOn` is a defensible duration
for the last processing attempt when both fields refer to that attempt. It is
not total wall-clock lifecycle time and does not include prior attempts,
backoff, queue waiting, or stalled periods.

**The current API does not expose a per-job wait time or full lifecycle age.**
The dashboard derives wait as `waiting`/`added` event timestamp to `active` event
timestamp and duration as `active` to final `completed`/`failed`; those pairs
exist only in the in-memory map while the board is listening. [`packages/api/src/metrics/capture.ts:45-79`](../../packages/api/src/metrics/capture.ts#L45-L79)
The resulting store is minute-granular and aggregate-only. [`packages/api/src/typings/app.ts:237-248`](../../packages/api/src/typings/app.ts#L237-L248)

**A delayed job proves current delayed membership and a delay field, not a
guaranteed due time.** The current adapter returns the BullMQ job's `delay`
field and state, but does not read the delayed event's absolute timestamp or
the delayed sorted-set score. [`packages/api/src/handlers/queues.ts:21-30`](../../packages/api/src/handlers/queues.ts#L21-L30)
BullMQ's `delayed` event carries a timestamp, while the public job `delay` is a
millisecond delay; the delayed guide warns that processing is not guaranteed at
the exact scheduled time. [QueueEventsListener `delayed`](https://docs.bullmq.io/api/interfaces/v6.QueueEventsListener.html#delayed)
[Delayed jobs guide](https://docs.bullmq.io/guide/jobs/delayed)
The Redis score encodes the scheduled timestamp with ordering bits in
[`getDelayedScore.lua`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/commands/includes/getDelayedScore.lua),
but decoding that private key representation is not a current dashboard API and
should not be an alpha.3 promise.

**The existing metrics promise is coarse and conditional.** While the listener
is attached, it can report per-minute completed/failed counts and event-derived
average wait and processing duration. [`packages/api/src/metrics/capture.ts:66-87`](../../packages/api/src/metrics/capture.ts#L66-L87)
With pre-existing worker-native metrics, counts can cover periods when the
board was down; native metrics do not provide per-job wait/duration samples.
[`packages/api/src/handlers/metrics.spec.ts:164-190`](../../packages/api/src/handlers/metrics.spec.ts#L164-L190)
The API clamps reads to the store retention. [`packages/api/src/handlers/metrics.ts:42-58`](../../packages/api/src/handlers/metrics.ts#L42-L58)

### Worker Facts

**The workers view is a current Redis connection roster.** BullMQ's
`Queue.getWorkers` filters `CLIENT LIST` entries by the queue's BullMQ client
name; bullmq-dash normalizes the result to connection id, optional worker name,
address, and Redis connection age. [`packages/api/src/queueAdapters/bullMQ.ts:310-313`](../../packages/api/src/queueAdapters/bullMQ.ts#L310-L313)
[`packages/api/src/queueAdapters/base.ts:210-233`](../../packages/api/src/queueAdapters/base.ts#L210-L233)
Official sources: [Queue API `getWorkers`](https://docs.bullmq.io/api/classes/v6.Queue.html#getworkers)
and [`src/classes/queue-getters.ts`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/classes/queue-getters.ts).
The displayed age is connection age, not worker process uptime or job duration. [`packages/ui/src/queues/QueueWorkers.tsx:54-73`](../../packages/ui/src/queues/QueueWorkers.tsx#L54-L73)

**A job may identify only the last named worker.** BullMQ stores `processedBy`
from `WorkerOptions.name` when entering active; unnamed workers leave no useful
worker name, and the field is overwritten on a later attempt. [`prepareJobForProcessing.lua`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/commands/includes/prepareJobForProcessing.lua)
[`packages/api/src/typings/app.ts:129-145`](../../packages/api/src/typings/app.ts#L129-L145)
The current UI does not render it. [`packages/ui/src/queues/JobDetail.tsx:75-88`](../../packages/ui/src/queues/JobDetail.tsx#L75-L88)
There is no current mapping from a job to a worker connection id, process,
host-level code version, concurrency setting, processor stack, or worker
history.

**Worker presence is not evidence of worker health or ownership.** The API
deliberately distinguishes an empty roster from an inability to query the
queue, but it does not expose active locks, lock-renewal history, or which
worker currently owns an active job. [`packages/api/src/handlers/workers.ts:4-24`](../../packages/api/src/handlers/workers.ts#L4-L24)
Those limits follow from BullMQ's worker API, which exposes processing methods
and events but no historical worker attribution: [Worker API](https://docs.bullmq.io/api/classes/v6.Worker.html).

### Flow and Dependency Facts

**A retained Flow can be reconstructed as current topology.** The per-job route
walks the `opts.parent` chain across registered queues, finds the root, and
calls `FlowProducer.getFlow`. [`packages/api/src/providers/flow.ts:80-135`](../../packages/api/src/providers/flow.ts#L80-L135)
BullMQ documents FlowProducer parent-child trees, cross-queue children, and
`getFlow`: [Flows guide](https://docs.bullmq.io/guide/flows),
[Get Flow Tree guide](https://docs.bullmq.io/guide/flows/get-flow-tree), and
[FlowProducer API](https://docs.bullmq.io/api/classes/v6.FlowProducer.html).
This can show current node id, name, queue, state, progress, and child edges.
[`packages/api/src/providers/flow.ts:176-185`](../../packages/api/src/providers/flow.ts#L176-L185)

**The Flow view is live and bounded, not historical or exhaustive.** Queue-level
root discovery reads only `active`, `waiting`, and `waiting-children`, scans at
most 200 candidates per state, filters out jobs with parents, expands each root
to depth 5, and caps the response at 200 nodes across roots. [`packages/api/src/providers/flow.ts:188-237`](../../packages/api/src/providers/flow.ts#L188-L237)
The API reports `truncated` when a scan or node budget is exhausted. [`packages/api/src/typings/app.ts:220-231`](../../packages/api/src/typings/app.ts#L220-L231)
The per-job route uses BullMQ's default depth and child limit because it does
not pass explicit limits. [`packages/api/src/providers/flow.ts:122-135`](../../packages/api/src/providers/flow.ts#L122-L135)
Consequently, completed or failed roots are available to the per-job route only
if retained, while the queue-level graph intentionally does not discover them.

**The current Flow node is diagnostic topology only.** `simplifyNode` drops
data, options, attempts, timestamps, failure reason, stacktrace, return value,
logs, and dependency result values. [`packages/api/src/providers/flow.ts:148-185`](../../packages/api/src/providers/flow.ts#L148-L185)
The current Flow contract contains only id, name, state, progress, queue name,
and children. [`packages/api/src/typings/app.ts:195-207`](../../packages/api/src/typings/app.ts#L195-L207)

**BullMQ can expose richer direct dependency facts, but bullmq-dash does not
currently expose them.** BullMQ's `Job.getDependencies` and
`getDependenciesCount` distinguish processed, unprocessed, failed, and ignored
children; `getChildrenValues` exposes processed child results. [Flows guide,
Getters](https://docs.bullmq.io/guide/flows#getters), [Job API
`getDependencies`](https://docs.bullmq.io/api/classes/v6.Job.html#getdependencies),
and [`src/classes/job.ts`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/classes/job.ts).
The current adapter has no dependency methods and the current REST routes have
only the two bounded Flow routes, not dependency endpoints. [`packages/api/src/queueAdapters/base.ts:89-109`](../../packages/api/src/queueAdapters/base.ts#L89-L109)
[`packages/api/src/routes.ts:39-61`](../../packages/api/src/routes.ts#L39-L61)

**Dependency reconstruction is conditional on retained nodes and metadata.** A
missing parent queue, missing parent job, or a failed tree lookup makes the
current parent-chain walk return no root. [`packages/api/src/providers/flow.ts:93-115`](../../packages/api/src/providers/flow.ts#L93-L115)
Removing a Flow job removes its job/dependency keys, and removing or
auto-removing children can leave no child snapshot for a later tree read. [`removeJobKeys.lua`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/commands/includes/removeJobKeys.lua)
The dashboard can therefore report current retained edges and node states, but
not a historical dependency graph or a complete explanation of a past parent
block.

### Log Facts

**The logs endpoint returns only BullMQ job log rows that still exist.** The
adapter calls `Queue.getJobLogs` newest-first, and the handler pages those rows
after confirming that the job hash exists. [`packages/api/src/queueAdapters/bullMQ.ts:94-100`](../../packages/api/src/queueAdapters/bullMQ.ts#L94-L100)
[`packages/api/src/handlers/jobLogs.ts:11-33`](../../packages/api/src/handlers/jobLogs.ts#L11-L33)
BullMQ appends rows to a per-job Redis list with `Job.log`/`Queue.addJobLog`; an
optional `keepLogs` trims that list. [`addLog-2.lua`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/commands/addLog-2.lua)
[Job API `log`](https://docs.bullmq.io/api/classes/v6.Job.html#log)

Log rows have no timestamp, attempt id, worker id, severity, or automatic link
to an exception. An empty response means no retained BullMQ log rows, not that
the processor emitted no stdout/stderr or performed no work. Job removal also
deletes the log list. [`removeJobKeys.lua`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/commands/includes/removeJobKeys.lua)
The repository tests verify ordering and paging, not historical attribution.
[`packages/api/src/handlers/jobLogs.spec.ts:57-94`](../../packages/api/src/handlers/jobLogs.spec.ts#L57-L94)

### Scheduler and Delay Facts

Job schedulers provide a useful current schedule snapshot, not a run ledger.
The adapter reads scheduler metadata and the next generated job; for interval
schedules it can derive a previous generated id when that job still exists, but
for cron schedules it deliberately does not infer a previous id. [`packages/api/src/queueAdapters/bullMQ.ts:161-184`](../../packages/api/src/queueAdapters/bullMQ.ts#L161-L184)
[`packages/api/src/queueAdapters/bullMQ.ts:248-304`](../../packages/api/src/queueAdapters/bullMQ.ts#L248-L304)
BullMQ's scheduler API documents configured schedulers and next execution, not
a durable run history: [manage Job Schedulers guide](https://docs.bullmq.io/guide/job-schedulers/manage-job-schedulers)
and [JobScheduler API](https://docs.bullmq.io/api/classes/v6.JobScheduler.html).
The next/last display must therefore be described as derived schedule evidence,
not proof of every previous run.

## Alpha.3 Decisions

### Safe to Promise

- **Retained snapshot:** inspect current state, id/name, data, options,
  progress, cumulative `attemptsMade`, latest failure/result fields, stacktrace
  rows, and the persisted timestamp fields that are present. [`packages/api/src/typings/app.ts:129-150`](../../packages/api/src/typings/app.ts#L129-L150)
- **Final outcome:** for a retained completed or failed job, show its current
  final state and final result or failure snapshot. Do not imply first-attempt
  success/failure. [`packages/api/src/handlers/job.ts:17-27`](../../packages/api/src/handlers/job.ts#L17-L27)
- **Current queue state:** list current state collections, including
  `waiting-children` and `prioritized` at the API layer, with paused as a v6
  queue presentation. [`packages/api/src/queueAdapters/bullMQ.ts:385-401`](../../packages/api/src/queueAdapters/bullMQ.ts#L385-L401)
- **Coarse metrics:** report per-minute completed/failed counts and average
  wait/duration only as event-derived monitoring data; counts during downtime
  are conditional on worker-native metrics already being enabled. [`packages/api/src/handlers/metrics.ts:60-80`](../../packages/api/src/handlers/metrics.ts#L60-L80)
- **Current workers:** report the Redis-visible worker connections, names when
  supplied, addresses, and connection ages. [`packages/api/src/typings/app.ts:43-55`](../../packages/api/src/typings/app.ts#L43-L55)
- **Current Flow topology:** show retained current node states/progress and
  cross-queue edges, with explicit bounded/truncated behavior. [`packages/api/src/typings/app.ts:195-231`](../../packages/api/src/typings/app.ts#L195-L231)
- **Retained logs:** show application-written BullMQ log rows in newest-first
  order with count and pagination. [`packages/api/src/typings/app.ts:190-193`](../../packages/api/src/typings/app.ts#L190-L193)

### Do Not Promise

- A complete job lifecycle timeline or an audit trail after dashboard restart,
  event-stream trimming, job cleanup, auto-removal, or explicit removal.
- A per-attempt timeline, exact attempt duration/wait/backoff, attempt-specific
  exception, stall timestamp, or worker/process attribution.
- A stable public/current-dashboard exact due-time field or a guarantee that
  processing occurred at the scheduled time. Raw delayed-set decoding remains
  an implementation-level fallback, not a product contract.
- A complete Flow/dependency history, dependency result/error inventory, or an
  unbounded Flow graph.
- Application logs, stdout/stderr, timestamps, or attempt ownership when the
  application did not write BullMQ log rows.
- A causal answer such as which code version, host, worker connection, external
  request, rate-limit wait, or lock-renewal failure caused a job's behavior.

These exclusions are not merely missing UI polish. The current code either
discards the relevant BullMQ field/event, stores only a mutable scalar, reads
only a bounded current collection, or never receives the evidence at all. The
official BullMQ telemetry path exists, but enabling it requires worker/queue
configuration and is outside this no-application-change alpha boundary. [BullMQ
Telemetry guide](https://docs.bullmq.io/guide/telemetry) and [telemetry getting
started](https://docs.bullmq.io/guide/telemetry/getting-started).

## Evidence Gaps That Constrain Alpha.3

1. **No durable per-job event history.** Existing QueueEvents capture starts at
   the live tail, ignores several diagnostic event types, and retains only
   in-memory timing pairs plus aggregate buckets. [`packages/api/src/metrics/capture.ts:35-129`](../../packages/api/src/metrics/capture.ts#L35-L129)
2. **No attempt dimension.** `attemptsStarted` and `stalledCounter` are in
   BullMQ's stored model but absent from `AppJob`; `processedOn` and
   `processedBy` are last-value fields. [`packages/api/src/typings/app.ts:129-150`](../../packages/api/src/typings/app.ts#L129-L150)
3. **No stable retry identity.** Manual retry clears outcome/timing fields, can
   leave stacktrace evidence, and shares the same id as automatic retry. [`packages/api/src/handlers/jobActions.ts:14-28`](../../packages/api/src/handlers/jobActions.ts#L14-L28)
4. **Retention is application-controlled.** `removeOnComplete`, `removeOnFail`,
   `keepLogs`, `clean`, `drain`, and explicit Flow removal can destroy the
   evidence before the board reads it. [BullMQ auto-removal](https://docs.bullmq.io/guide/queues/auto-removal-of-jobs)
   [`removeJobKeys.lua`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/commands/includes/removeJobKeys.lua)
5. **Flow is a bounded current view.** Root discovery, depth, child limits,
   registered-queue lookup, and the 200-node budget all limit completeness and
   omit diagnostic fields from nodes. [`packages/api/src/providers/flow.ts:188-237`](../../packages/api/src/providers/flow.ts#L188-L237)
6. **Worker identity is optional and ephemeral.** BullMQ can expose current
   client-list workers and a named last processor, but not a durable worker
   identity or historical ownership. [`packages/api/src/queueAdapters/bullMQ.ts:310-313`](../../packages/api/src/queueAdapters/bullMQ.ts#L310-L313)
7. **Timing coverage is conditional.** Dashboard uptime is required for event
   wait/duration samples; native metrics can cover only counts during downtime
   and only when preconfigured. [`packages/api/src/metrics/native.ts:20-25`](../../packages/api/src/metrics/native.ts#L20-L25)

The resulting alpha.3 positioning should be **"retained BullMQ state and
current topology with best-effort aggregate timing"**, not **"full historical
job debugging without instrumentation."**

## Primary Sources Consulted

- Repository implementation and tests: `packages/api/src/handlers/job.ts`,
  `queues.ts`, `jobActions.ts`, `jobLogs.ts`, `queueJobs.ts`, `workers.ts`,
  `metrics.ts`, `packages/api/src/metrics/`, `packages/api/src/providers/flow.ts`,
  `packages/api/src/queueAdapters/`, `packages/api/src/typings/app.ts`, and
  the corresponding `*.spec.ts` files linked above.
- BullMQ v6.1.0 source: [`src/classes/job.ts`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/classes/job.ts),
  [`src/classes/queue-getters.ts`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/classes/queue-getters.ts),
  [`src/classes/queue-events.ts`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/classes/queue-events.ts),
  [`src/classes/worker.ts`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/classes/worker.ts),
  [`src/classes/flow-producer.ts`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/classes/flow-producer.ts),
  [`src/classes/job-scheduler.ts`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/classes/job-scheduler.ts),
  [`src/interfaces/job-json.ts`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/interfaces/job-json.ts),
  and the Lua command/include paths cited inline.
- Official BullMQ v6 API and guides: [Job](https://docs.bullmq.io/api/classes/v6.Job.html),
  [Queue](https://docs.bullmq.io/api/classes/v6.Queue.html),
  [QueueEventsListener](https://docs.bullmq.io/api/interfaces/v6.QueueEventsListener.html),
  [Worker](https://docs.bullmq.io/api/classes/v6.Worker.html),
  [FlowProducer](https://docs.bullmq.io/api/classes/v6.FlowProducer.html),
  [getters](https://docs.bullmq.io/guide/jobs/getters),
  [retrying failing jobs](https://docs.bullmq.io/guide/retrying-failing-jobs),
  [retrying jobs](https://docs.bullmq.io/guide/jobs/retrying-job),
  [delayed jobs](https://docs.bullmq.io/guide/jobs/delayed),
  [stalled jobs](https://docs.bullmq.io/guide/workers/stalled-jobs),
  [flows](https://docs.bullmq.io/guide/flows),
  [get Flow Tree](https://docs.bullmq.io/guide/flows/get-flow-tree),
  [auto-removal](https://docs.bullmq.io/guide/queues/auto-removal-of-jobs),
  [Job Schedulers](https://docs.bullmq.io/guide/job-schedulers/manage-job-schedulers),
  and [telemetry](https://docs.bullmq.io/guide/telemetry).

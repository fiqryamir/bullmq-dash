# Competitor Debugging Workflows

## Scope

This research answers issue [#89](https://github.com/fiqryamir/bullmq-dash/issues/89): what bull-board, Workbench, Bullstudio, and Taskforce actually support for execution timelines, attempt history, worker diagnosis, flow bottlenecks, and replay/diff.

The comparison uses public first-party documentation and source code. Public source snapshots were inspected at these revisions:

| Product | Public source | Revision |
| --- | --- | --- |
| bull-board | [felixmosh/bull-board](https://github.com/felixmosh/bull-board) | [`9235854`](https://github.com/felixmosh/bull-board/tree/9235854330cefbd0e611896e3ed8fc0ab463c4cd) |
| Workbench | [pontusab/workbench](https://github.com/pontusab/workbench) | [`aefd22c`](https://github.com/pontusab/workbench/tree/aefd22c11cbebc26c619df201641995e661af624) |
| Bullstudio | [emirce/bullstudio](https://github.com/emirce/bullstudio) | [`eaa3c08`](https://github.com/emirce/bullstudio/tree/eaa3c08a004b95071bd7ce1205af1f2df00a9414) |
| Taskforce | [taskforcesh/taskforce-connector](https://github.com/taskforcesh/taskforce-connector) | [`c29600b`](https://github.com/taskforcesh/taskforce-connector/tree/c29600b57d12b544c355b851f5f81088ce9546d4) |

Taskforce's hosted dashboard is not public. Its documentation and connector establish what the public integration exposes, but dashboard-specific features that cannot be verified there are marked **Unknown**, not **Unsupported**.

### Status Vocabulary

- **Verified:** visible in the cited implementation or first-party documentation.
- **Inferred:** a user can derive a useful signal from the displayed data, but the product does not implement the stated diagnostic concept explicitly.
- **Unknown:** the inspected public sources do not establish the capability.

## Executive Verdict

| Product | Execution timeline | Attempt history | Worker diagnosis | Flow bottleneck | Replay / diff |
| --- | --- | --- | --- | --- | --- |
| bull-board | **Verified, derived:** created, started, finished, delay, and last named worker. | **Verified, partial:** cumulative attempts and stacktrace rows; no per-attempt event record. | **Verified, limited:** current Redis worker connection name/address/age. | **Verified, limited:** current parent/child tree with state and progress only. | **Verified, operational:** retry, duplicate-as-new-job, update data; no forensic diff. |
| Workbench | **Verified, richest derived view:** waterfall from scalar job fields, plus optional progress-log entries. | **Verified, partial:** attempts summary and stacktrace cards labelled as retry attempts; no per-attempt timestamps or workers. | **Verified, limited:** worker count and no-workers-with-backlog alert; no worker roster page in the inspected core. | **Verified, derived:** DAG with per-node duration and state; no critical-path or bottleneck ranking. | **Verified, operational:** retry, JSON export, clone into a new enqueue form; no diff. |
| Bullstudio | **Verified, limited:** scalar created/started/finished metadata and duration. | **Verified, partial:** attempts limit/count and full stacktrace; no attempt timeline or attempt identity. | **Verified, current roster:** worker name/id/address/age/idle/metadata. | **Verified, derived:** current DAG with node duration and state; no bottleneck algorithm. | **Verified, operational:** retry and queue-level add; no job diff or verified job clone flow. |
| Taskforce | **Unknown:** public docs show job details and aggregate metrics, not a lifecycle timeline. | **Unknown:** public connector returns raw jobs and logs but has no history endpoint. | **Verified, operational:** worker list/count and missing-worker monitoring. | **Unknown:** connector exposes dependency lookup; dashboard visualization/bottleneck analysis is not public. | **Verified, operational:** retry, edit data, add job; dashboard diff/replay semantics are Unknown. |

The common gap is not another job-details panel. None of the publicly verified implementations combines durable per-attempt timing, worker ownership, causal explanation, and payload diffing from the standard retained BullMQ data. Those facts are generally not stored as a durable history by BullMQ itself; BullMQ's public Job model exposes mutable current fields and cumulative counters rather than an attempt-event collection. [BullMQ Job API](https://docs.bullmq.io/api/classes/v6.Job.html), [`JobJson`](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/interfaces/job-json.ts). The practical alpha.3 opportunity is therefore an evidence-first view that is explicit about what is observed and what was never recorded.

## Terminology Used

- **Execution timeline** means a sequence of lifecycle or attempt events. A bar computed from `timestamp`, `processedOn`, and `finishedOn` is a derived snapshot timeline, not an event history.
- **Attempt history** means attempt-specific start/finish, delay, worker, error, and outcome. `attemptsMade` plus an array of stacktrace strings is only partial evidence.
- **Worker diagnosis** means more than counting connected Redis clients. Ownership, concurrency, processor code, host, and historical worker attribution are separate facts.
- **Flow bottleneck** means an explicit slow-node, critical-path, blocked-dependency, or wait-reason analysis. A graph that happens to show durations supports inference, not a bottleneck diagnosis.
- **Replay/diff** means a repeatable debugging workflow that preserves or compares evidence. Retrying the same BullMQ job id, cloning its payload, or editing data are operational mutations, not an audit diff.

## bull-board

### Execution Timeline

**Verified:** the current job formatter exposes `timestamp`, optional `processedOn`, optional `processedBy`, optional `finishedOn`, `delay`, `attemptsMade` as `attempts`, failure data, stacktrace, options, payload, and return value. [`formatJob`](https://github.com/felixmosh/bull-board/blob/9235854330cefbd0e611896e3ed8fc0ab463c4cd/packages/api/src/handlers/queues.ts#L14-L40)

The job Timeline renders:

- Added at `timestamp`.
- Delayed-until time for a currently delayed job.
- Process started at `processedOn`, with elapsed time from `timestamp` and optional `processedBy`.
- Finished or failed at `finishedOn`, with elapsed time from `processedOn`.

This is a useful retained snapshot, but it is not an event-sourced timeline. The UI only has the scalar fields above and computes the durations at render time. [`Timeline.tsx`](https://github.com/felixmosh/bull-board/blob/9235854330cefbd0e611896e3ed8fc0ab463c4cd/packages/ui/src/components/JobCard/Timeline/Timeline.tsx#L11-L104)

**Verified limitation:** the timeline does not show separate automatic retries, backoff periods, stalls, or previous worker assignments. A later attempt overwrites the scalar processing fields in the job representation. [BullMQ `Job` implementation](https://github.com/taskforcesh/bullmq/blob/v6.1.0/src/classes/job.ts)

### Attempt History

**Verified, partial:** bull-board displays cumulative `attemptsMade` and the retained stacktrace rows. The formatter reverses the rows before returning them, but does not attach an attempt id, timestamp, worker, or outcome to a row. [`formatJob`](https://github.com/felixmosh/bull-board/blob/9235854330cefbd0e611896e3ed8fc0ab463c4cd/packages/api/src/handlers/queues.ts#L14-L35)

**Verified absence in the inspected public implementation:** there is no per-attempt history endpoint or attempt-specific timeline component. Logs are available when the worker wrote BullMQ job logs, but they are not an attempt ledger. [`job-logs-and-flows.md`](https://github.com/felixmosh/bull-board/blob/9235854330cefbd0e611896e3ed8fc0ab463c4cd/website/docs/recipes/job-logs-and-flows.md#L5-L23)

### Worker Diagnosis

**Verified, limited:** the BullMQ adapter calls `queue.getWorkers()` and normalizes each Redis client to id, optional worker name, address, and connection age. [`bullMQ.ts`](https://github.com/felixmosh/bull-board/blob/9235854330cefbd0e611896e3ed8fc0ab463c4cd/packages/api/src/queueAdapters/bullMQ.ts#L107-L117), [`base.ts`](https://github.com/felixmosh/bull-board/blob/9235854330cefbd0e611896e3ed8fc0ab463c4cd/packages/api/src/queueAdapters/base.ts#L172-L215)

The workers view renders that roster and warns when no workers are connected. It does not expose concurrency, current job ownership, processor identity, code version, host health, or worker history. [`WorkersList.tsx`](https://github.com/felixmosh/bull-board/blob/9235854330cefbd0e611896e3ed8fc0ab463c4cd/packages/ui/src/components/WorkersList/WorkersList.tsx#L24-L59)

### Flow Bottlenecks

**Verified:** bull-board can render a BullMQ parent/child tree and link from a node to its job. The API reduces each flow node to id, name, progress, state, queue name, and children. [`jobFlow.ts`](https://github.com/felixmosh/bull-board/blob/9235854330cefbd0e611896e3ed8fc0ab463c4cd/packages/api/src/handlers/jobFlow.ts#L12-L29), [`JobFlow.tsx`](https://github.com/felixmosh/bull-board/blob/9235854330cefbd0e611896e3ed8fc0ab463c4cd/packages/ui/src/components/JobFlow/JobFlow.tsx#L44-L96)

**Verified limitation:** flow nodes deliberately omit timestamps, attempts, failure reason, stacktrace, return value, and logs. A user can infer that a node is waiting or failed from its state, but there is no node duration, critical-path, dependency reason, or slowest-node calculation. [`jobFlow.ts`](https://github.com/felixmosh/bull-board/blob/9235854330cefbd0e611896e3ed8fc0ab463c4cd/packages/api/src/handlers/jobFlow.ts#L17-L28)

### Replay and Diff

**Verified operational controls:** the job action map includes retry, duplicate, update data, promote, and clean. [`JobActions.tsx`](https://github.com/felixmosh/bull-board/blob/9235854330cefbd0e611896e3ed8fc0ab463c4cd/packages/ui/src/components/JobCard/JobActions/JobActions.tsx#L14-L58)

Duplicate opens the add-job form prefilled with the selected job's name, data, and options, then calls the queue add operation. It creates a new job rather than preserving the original job id and its evidence. [`AddJobModal.tsx`](https://github.com/felixmosh/bull-board/blob/9235854330cefbd0e611896e3ed8fc0ab463c4cd/packages/ui/src/components/AddJobModal/AddJobModal.tsx#L28-L108)

**Verified absence in the inspected public implementation:** no payload/result diff or evidence comparison workflow was found. Retry and duplicate are recovery/testing actions, not forensic replay.

### Metrics Context

The optional historical metrics package records native per-minute completed/failed metrics into Redis and adds longer-range charts. Its documentation requires native worker metrics and describes aggregate history, not per-job or per-attempt history. [`historical-metrics.md`](https://github.com/felixmosh/bull-board/blob/9235854330cefbd0e611896e3ed8fc0ab463c4cd/website/docs/recipes/historical-metrics.md#L1-L19), [`README.md`](https://github.com/felixmosh/bull-board/blob/9235854330cefbd0e611896e3ed8fc0ab463c4cd/README.md#L70-L78)

## Workbench

### Execution Timeline

**Verified:** Workbench's `JobInfo` contains the same scalar timing fields plus a derived `duration`. [`types.ts`](https://github.com/pontusab/workbench/blob/aefd22c11cbebc26c619df201641995e661af624/packages/core/src/core/types.ts#L245-L274), [`queue-manager.ts`](https://github.com/pontusab/workbench/blob/aefd22c11cbebc26c619df201641995e661af624/packages/core/src/core/queue-manager.ts#L1958-L2044)

The job page builds a waterfall with:

- A root job span from `timestamp` to `finishedOn` or the current time.
- A queued span from `timestamp` to `processedOn`.
- An execution span from `processedOn` to `finishedOn`.
- Optional progress entries when the application's progress object contains a `logs` array with optional timestamps.
- A final error entry at the final failure time.

[`job.tsx`](https://github.com/pontusab/workbench/blob/aefd22c11cbebc26c619df201641995e661af624/packages/core/src/ui/pages/job.tsx#L677-L811)

This is the strongest verified single-job timeline in the comparison, but it is still derived from mutable scalar fields. The optional progress log entries are application-provided progress data, not captured QueueEvents or attempt events.

Workbench also exposes aggregate activity buckets. The queue manager computes completed/failed buckets over a seven-day window by reading retained jobs, rather than storing a per-job event history. [`queue-manager.ts`](https://github.com/pontusab/workbench/blob/aefd22c11cbebc26c619df201641995e661af624/packages/core/src/core/queue-manager.ts#L780-L874)

### Attempt History

**Verified, partial:** the job page shows attempts made versus the configured maximum and adds a Retries tab when stacktrace rows exist. `RetryHistory` labels each retained stacktrace row as an attempt and marks the last row as eventual success only when the current job status is completed. [`job.tsx`](https://github.com/pontusab/workbench/blob/aefd22c11cbebc26c619df201641995e661af624/packages/core/src/ui/pages/job.tsx#L341-L401), [`job.tsx`](https://github.com/pontusab/workbench/blob/aefd22c11cbebc26c619df201641995e661af624/packages/core/src/ui/pages/job.tsx#L979-L1027)

**Verified limitation:** the API model supplies `attemptsMade` and `stacktrace`, but no per-attempt timestamps, backoff, worker, state transition, or attempt id. The UI therefore provides an error-oriented retry summary, not a complete attempt history.

### Worker Diagnosis

**Verified, limited:** queue information includes `workerCount`, read through `Queue.getWorkersCount()`. [`types.ts`](https://github.com/pontusab/workbench/blob/aefd22c11cbebc26c619df201641995e661af624/packages/core/src/core/types.ts#L210-L238), [`queue-manager.ts`](https://github.com/pontusab/workbench/blob/aefd22c11cbebc26c619df201641995e661af624/packages/core/src/core/queue-manager.ts#L328-L363)

Workbench's alert manager can fire a `no_workers_with_backlog` alert when waiting, prioritized, or waiting-children jobs exist and the worker count is zero. [`alert-manager.ts`](https://github.com/pontusab/workbench/blob/aefd22c11cbebc26c619df201641995e661af624/packages/core/src/core/alert-manager.ts#L256-L307)

The public core has a `WorkerInfo` type, but the inspected queue/API/UI path only uses worker count. No verified worker identity list, current-job ownership, concurrency, processor, or worker history was found.

### Flow Bottlenecks

**Verified:** Workbench's FlowNode contains full `JobInfo`, including timestamps, attempts, failure data, and derived duration. The flow converter calculates `finishedOn - processedOn` for each node. [`types.ts`](https://github.com/pontusab/workbench/blob/aefd22c11cbebc26c619df201641995e661af624/packages/core/src/core/types.ts#L498-L528), [`queue-manager.ts`](https://github.com/pontusab/workbench/blob/aefd22c11cbebc26c619df201641995e661af624/packages/core/src/core/queue-manager.ts#L2387-L2437)

The UI displays the flow DAG, counts total/completed/failed nodes, and shows the root duration. The graph nodes can display per-node duration. [`flow.tsx`](https://github.com/pontusab/workbench/blob/aefd22c11cbebc26c619df201641995e661af624/packages/core/src/ui/pages/flow.tsx#L74-L140)

**Inferred:** a user can identify a slow-looking node by comparing the displayed durations and states. No explicit critical-path, longest-node, blocked-dependency, or bottleneck ranking algorithm was found in the inspected flow implementation.

### Replay and Diff

**Verified operational controls:** the API has a same-id `retry` endpoint. [`handlers.ts`](https://github.com/pontusab/workbench/blob/aefd22c11cbebc26c619df201641995e661af624/packages/core/src/api/handlers.ts#L492-L515)

The job page exports a JSON snapshot and has a Clone action that passes only the current queue, name, and payload into the test-job form. The form then enqueues a new job with `queue.add`. [`job.tsx`](https://github.com/pontusab/workbench/blob/aefd22c11cbebc26c619df201641995e661af624/packages/core/src/ui/pages/job.tsx#L103-L138), [`test.tsx`](https://github.com/pontusab/workbench/blob/aefd22c11cbebc26c619df201641995e661af624/packages/core/src/ui/pages/test.tsx#L21-L79), [`queue-manager.ts`](https://github.com/pontusab/workbench/blob/aefd22c11cbebc26c619df201641995e661af624/packages/core/src/core/queue-manager.ts#L1690-L1715)

**Verified absence in the inspected core implementation:** there is no payload diff, result diff, or replay-subtree endpoint. Workbench marketing copy says to "replay subtrees," but the cited public API and UI implementation establish retry and clone/enqueue, not that stronger workflow. Compare the marketing claim in [`page.tsx`](https://github.com/pontusab/workbench/blob/aefd22c11cbebc26c619df201641995e661af624/apps/web/src/app/page.tsx#L250-L265) with the implemented routes in [`handlers.ts`](https://github.com/pontusab/workbench/blob/aefd22c11cbebc26c619df201641995e661af624/packages/core/src/api/handlers.ts#L492-L515).

## Bullstudio

### Execution Timeline

**Verified, limited:** Bullstudio's public job model contains `timestamp`, optional `processedOn`, optional `finishedOn`, attempts, failure data, and stacktrace. [`job.ts`](https://github.com/emirce/bullstudio/blob/eaa3c08a004b95071bd7ce1205af1f2df00a9414/packages/connect-types/src/job.ts#L10-L30), [`index.ts`](https://github.com/emirce/bullstudio/blob/eaa3c08a004b95071bd7ce1205af1f2df00a9414/packages/bullmq-adapter/src/index.ts#L637-L657)

The job detail view calculates and displays one duration from `finishedOn - processedOn`, plus created time, attempts, delay, and scheduled time. It has tabs for input data, logs, result, flow, and error; there is no Timeline tab or per-job waterfall in the inspected frontend. [`JobDetail.tsx`](https://github.com/emirce/bullstudio/blob/eaa3c08a004b95071bd7ce1205af1f2df00a9414/apps/frontend/src/components/jobs/JobDetail.tsx#L169-L287)

### Attempt History

**Verified, partial:** Bullstudio displays attempts made versus its attempts limit and renders the complete retained stacktrace in the error panel. [`JobDetail.tsx`](https://github.com/emirce/bullstudio/blob/eaa3c08a004b95071bd7ce1205af1f2df00a9414/apps/frontend/src/components/jobs/JobDetail.tsx#L243-L265), [`JobDetail.tsx`](https://github.com/emirce/bullstudio/blob/eaa3c08a004b95071bd7ce1205af1f2df00a9414/apps/frontend/src/components/jobs/JobDetail.tsx#L359-L390)

Bullstudio's first-party comparison page describes this as getting "every attempt" in one place. The implementation evidence supports retained attempt count and stacktrace rows, but the public `Job` model has no attempt-specific id, timestamp, worker, delay, or outcome fields, and the UI has no attempt-history timeline. The safe interpretation is error evidence for retries, not a forensic attempt ledger. [`bullstudio-vs-bull-board.mdx`](https://github.com/emirce/bullstudio/blob/eaa3c08a004b95071bd7ce1205af1f2df00a9414/apps/website-with-docs/content/comparisons/bullstudio-vs-bull-board.mdx#L56-L60), [`job.ts`](https://github.com/emirce/bullstudio/blob/eaa3c08a004b95071bd7ce1205af1f2df00a9414/packages/connect-types/src/job.ts#L10-L30)

### Worker Diagnosis

**Verified:** Bullstudio has a worker route and table. Its worker model includes id, name, queue, provider, address, connection age, idle time, and metadata. [`worker.ts`](https://github.com/emirce/bullstudio/blob/eaa3c08a004b95071bd7ce1205af1f2df00a9414/packages/connect-types/src/worker.ts#L1-L16), [`WorkersTable.tsx`](https://github.com/emirce/bullstudio/blob/eaa3c08a004b95071bd7ce1205af1f2df00a9414/apps/frontend/src/components/workers/WorkersTable.tsx#L42-L115)

The worker detail sheet exposes the same current snapshot and queue actions. It does not show current job ownership, concurrency, processor, code version, or worker history. [`WorkerSheet.tsx`](https://github.com/emirce/bullstudio/blob/eaa3c08a004b95071bd7ce1205af1f2df00a9414/apps/frontend/src/components/workers/WorkerSheet.tsx#L132-L184)

### Flow Bottlenecks

**Verified:** Bullstudio supports flow listing and full job-flow lookup, including a job's parent chain across queues. The adapter returns each node's timestamp, processed time, finished time, state, failure reason, and child edges. [`index.ts`](https://github.com/emirce/bullstudio/blob/eaa3c08a004b95071bd7ce1205af1f2df00a9414/packages/bullmq-adapter/src/index.ts#L400-L450), [`index.ts`](https://github.com/emirce/bullstudio/blob/eaa3c08a004b95071bd7ce1205af1f2df00a9414/packages/bullmq-adapter/src/index.ts#L480-L499)

The frontend derives each node duration from its timestamps and displays it in the graph. The flow view also displays total, completed, and failed node counts. [`FlowGraph.tsx`](https://github.com/emirce/bullstudio/blob/eaa3c08a004b95071bd7ce1205af1f2df00a9414/apps/frontend/src/components/flows/FlowGraph.tsx#L34-L90), [`FlowDetail.tsx`](https://github.com/emirce/bullstudio/blob/eaa3c08a004b95071bd7ce1205af1f2df00a9414/apps/frontend/src/components/flows/FlowDetail.tsx#L95-L143)

**Inferred:** the graph lets an operator spot a slow or failed node. No explicit bottleneck ranking, critical path, dependency wait reason, or causal analysis was found.

### Replay and Diff

**Verified operational controls:** the BullMQ adapter supports `addJob`, `retryJob`, remove, logs, workers, and flows. [`index.ts`](https://github.com/emirce/bullstudio/blob/eaa3c08a004b95071bd7ce1205af1f2df00a9414/packages/bullmq-adapter/src/index.ts#L46-L185)

The private router exposes job add, retry, remove, and logs, but no job-specific clone or diff procedure. [`service.ts`](https://github.com/emirce/bullstudio/blob/eaa3c08a004b95071bd7ce1205af1f2df00a9414/packages/private-router/src/routers/jobs/service.ts#L72-L119)

**Verified absence in the inspected public implementation:** no payload/result diff, preserved replay identity, or replayed-flow operation was found. Adding a job and retrying a failed job remain operational actions.

### Metrics Context

Bullstudio combines native per-minute metrics with retained job summaries. Its metrics code explicitly states that timing, slowest jobs, and failing types come from raw job summaries, while native metrics provide counts that survive job removal. [`metrics.ts`](https://github.com/emirce/bullstudio/blob/eaa3c08a004b95071bd7ce1205af1f2df00a9414/packages/private-router/src/routers/overview/metrics.ts#L23-L88), [`service.ts`](https://github.com/emirce/bullstudio/blob/eaa3c08a004b95071bd7ce1205af1f2df00a9414/packages/private-router/src/routers/overview/service.ts#L28-L51)

The dashboard can show average processing time, queue delay, slowest jobs, and failing job types. These are aggregate or ranked snapshots, not attempt history or a flow bottleneck explanation.

## Taskforce

### Public Evidence Boundary

The official connector is a proxy between Bull/BullMQ queues and the Taskforce UI; the README describes it as a lightweight service rather than a dashboard implementation. [`README.md`](https://github.com/taskforcesh/taskforce-connector/blob/c29600b57d12b544c355b851f5f81088ce9546d4/README.md#L1-L8)

### Execution Timeline and Attempts

**Unknown:** Taskforce's public Jobs documentation verifies that operators can inspect options, data, result values, logs, error callstacks, and failure reasons, then retry or edit compatible jobs. It does not document a per-job lifecycle timeline or per-attempt event history. [`Jobs documentation`](https://docs.taskforce.sh/connections/jobs.md)

The public BullMQ v6 connector forwards `getJob`, state lists, `getJobLogs`, and native `getMetrics`. It returns the BullMQ job object directly and does not add a history store or attempt-history endpoint. [`bullmqv6-responders.ts`](https://github.com/taskforcesh/taskforce-connector/blob/c29600b57d12b544c355b851f5f81088ce9546d4/lib/responders/bullmqv6-responders.ts#L62-L110)

This establishes a public integration path for current job data and logs, not what the private dashboard may render from them. Timeline, attempt chronology, attempt attribution, and retry-history UI remain **Unknown**.

### Worker Diagnosis

**Verified:** Taskforce's Workers documentation describes a list of actual worker instances connected to a queue and positions it as a way to verify expected worker presence. It also warns that reused connections can make the table inaccurate. [`Workers documentation`](https://docs.taskforce.sh/connections/workers.md)

**Verified:** the documentation includes a Missing Workers monitor that can alert when the worker count falls below a configured threshold. [`Missing workers monitor`](https://docs.taskforce.sh/monitoring/missing-workers-monitor.md)

The connector supports both `getWorkers` and `getWorkersCount`; the latter counts the current Redis worker list. [`bullmqv6-responders.ts`](https://github.com/taskforcesh/taskforce-connector/blob/c29600b57d12b544c355b851f5f81088ce9546d4/lib/responders/bullmqv6-responders.ts#L96-L131)

The public sources verify current worker presence and monitoring, but not current job ownership, concurrency, processor details, or worker history.

### Flow Bottlenecks

**Verified integration capability:** the connector exposes BullMQ v6 `getDependencies`, so dependency facts can be requested from the queue. [`bullmqv6-responders.ts`](https://github.com/taskforcesh/taskforce-connector/blob/c29600b57d12b544c355b851f5f81088ce9546d4/lib/responders/bullmqv6-responders.ts#L78-L94)

**Unknown dashboard capability:** the official documentation index has Jobs, Workers, Metrics, and monitoring pages but no public flow page. [Taskforce documentation index](https://docs.taskforce.sh/llms.txt) The private dashboard's flow graph, node timing, blocked-dependency explanation, and bottleneck analysis cannot be verified from the connector.

Taskforce does provide backlog monitoring for waiting, prioritized, and delayed jobs. That is queue-health alerting, not flow critical-path analysis. [`Backlog monitor`](https://docs.taskforce.sh/monitoring/backlog-monitor.md)

### Replay and Diff

**Verified operational integration:** the connector supports retry, promote, remove, update job data, add a new job, and bulk retry. [`bullmqv6-responders.ts`](https://github.com/taskforcesh/taskforce-connector/blob/c29600b57d12b544c355b851f5f81088ce9546d4/lib/responders/bullmqv6-responders.ts#L24-L60), [`bullmqv6-responders.ts`](https://github.com/taskforcesh/taskforce-connector/blob/c29600b57d12b544c355b851f5f81088ce9546d4/lib/responders/bullmqv6-responders.ts#L132-L173)

**Unknown:** the public docs and connector do not establish a payload diff, result diff, preserved replay identity, or replayed-flow workflow in the hosted dashboard. Do not report those features as absent; report them as unverified because the dashboard is private.

### Metrics and Monitoring Context

Taskforce documents real-time metrics for up to two weeks with one-minute minimum granularity. Accurate completed/failed totals require queue metrics or retaining finalized jobs, and performance statistics require at least 1,000 completed jobs. [`Metrics documentation`](https://docs.taskforce.sh/metrics.md)

Its public monitoring surface includes connection, failed jobs, missing workers, max memory, and backlog monitors. Monitors are disabled by default. [`Monitoring documentation`](https://docs.taskforce.sh/monitoring.md)

## Current bullmq-dash Baseline

The local implementation already has the raw seams needed for an evidence-first alpha.3 view, but it intentionally does not retain a per-job event history.

### Existing Job Evidence

The API exposes current job state plus `timestamp`, `processedOn`, `processedBy`, `finishedOn`, cumulative attempts, delay, options, payload, return value, failure reason, and stacktrace. [`formatJob`](../../packages/api/src/handlers/queues.ts#L15-L38), [`jobHandler`](../../packages/api/src/handlers/job.ts#L10-L27)

BullMQ job logs are available as paginated retained rows. [`jobLogsHandler`](../../packages/api/src/handlers/jobLogs.ts#L11-L34)

The workers view already exposes current worker name, address, and connection age, with an explicit unknown state when the adapter cannot report workers. [`QueueWorkers.tsx`](../../packages/ui/src/queues/QueueWorkers.tsx#L14-L78)

The Flow API and UI already provide cross-queue parent/child topology and explicit truncation. The current flow node contract intentionally contains only id, name, progress, state, queue name, and children, so it cannot currently show node timing without a contract change. [`flow.ts`](../../packages/api/src/providers/flow.ts#L144-L185), [`FlowGraph.tsx`](../../packages/ui/src/queues/FlowGraph.tsx#L28-L47)

### Existing Timing Boundary

`MetricsCapture` listens to `waiting`, `added`, `active`, `completed`, and `failed`, derives wait and processing durations in an in-process map, and writes per-minute aggregate buckets. It does not persist event payloads, event ids, previous states, or per-job timing records. [`capture.ts`](../../packages/api/src/metrics/capture.ts#L22-L33), [`capture.ts`](../../packages/api/src/metrics/capture.ts#L35-L87), [`capture.ts`](../../packages/api/src/metrics/capture.ts#L113-L129)

The metrics store retains aggregate hashes per queue and minute, with a seven-day default retention and no job or attempt dimension. [`store.ts`](../../packages/api/src/metrics/store.ts#L3-L26), [`store.ts`](../../packages/api/src/metrics/store.ts#L69-L75)

## Alpha.3 Opportunity

### Evidence Dossier, Not a Fake Timeline

The unoccupied opportunity is a **retained-job evidence dossier**: one read-only surface that assembles the strongest available facts, ranks candidate flow slowdowns when timestamps exist, and visibly marks missing evidence.

The dossier can use existing data to show:

1. **Lifecycle snapshot:** created, started, finished, current state, last named processor, delay, and clearly named derived durations. A duration from `processedOn` to `finishedOn` should be labelled as the last observed processing span, not total lifecycle time.
2. **Attempt evidence:** cumulative attempts versus configured limit, retained stacktrace rows, latest failure reason, and retained job logs. The UI must say that per-attempt timestamps, workers, backoff, and outcomes are unavailable rather than presenting stacktrace rows as a complete history.
3. **Flow evidence:** node state, queue, current progress, and, after exposing the already-retained node timestamps, queue-wait and processing-duration overlays. Flag the longest current node or a parent in `waiting-children` as a **candidate** bottleneck, not a causal conclusion.
4. **Worker context:** current roster and last named worker when present, with explicit language that this is connection presence and last-value attribution, not ownership history or worker health.
5. **Evidence comparison:** compare two retained jobs' JSON payload, options, failure reason, stacktrace, and result. This is feasible with existing job snapshots and is a real diff, unlike retry or clone. It cannot compare prior versions of one job's payload unless those versions were separately retained.
6. **Safe action boundary:** keep retry and any clone/re-enqueue action visibly separate from the read-only dossier. A retry reuses mutable BullMQ state; a clone creates a new job id. Neither should be described as historical replay.

This opportunity is unoccupied among the publicly verified competitor surfaces: bull-board and Workbench provide derived timelines, Workbench and Bullstudio expose flow durations, and Taskforce provides strong operational monitoring, but no verified product combines evidence quality labels, retained-field timing, candidate flow bottlenecks, and an explicit comparison workflow. Taskforce's private dashboard keeps that final comparison qualified as "among verified public surfaces," not an absolute claim.

### Product Decision

Position alpha.3 as **"retained BullMQ evidence and current topology with best-effort timing"**, not **"full historical job debugging without instrumentation."** A true per-attempt audit trail, durable worker ownership, and causal replay require additional capture or application telemetry and cannot be reconstructed reliably from the current standard BullMQ fields.

## Research Conclusions

- Copy the useful derived timeline pattern, but label its source fields and confidence.
- Do not promise durable attempt history from `attemptsMade` and stacktrace arrays.
- Treat worker lists as current connection diagnosis, not worker ownership history.
- Add flow duration overlays and candidate bottleneck hints only when the data is retained, and distinguish heuristic ranking from causal explanation.
- Make job-to-job JSON/error comparison the differentiating diff workflow; do not call retry or clone a replay audit.
- Keep Taskforce's private dashboard capabilities marked Unknown until a public source verifies them.

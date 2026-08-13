# Per-job REST endpoints mirror bull-board, with paginated logs as an additive superset

Job detail in bullmq-dash v1 (issue #22) is served by per-job REST endpoints whose shapes mirror bull-board v8's: `GET /api/queues/:queueName/:jobId` → `{ job, status }` (the formatted job plus its live state), and `GET /api/queues/:queueName/:jobId/logs` → the job's log rows. The logs endpoint differs from bull-board in one deliberate way: where bull-board passes through `queue.getJobLogs(jobId)` unpaginated, bullmq-dash pages the rows server-side (`page`, `logsPerPage`, newest-first) and keeps bull-board's `{ logs, count }` fields, adding a `pagination` object. The detail endpoint itself carries no logs — they live on the sibling `/logs` route, exactly as in bull-board.

**Considered Options**

- **Mirror bull-board's shapes, page the logs** — adopted: the `{ logs, count }` passthrough stays wire-compatible for clients that ignore `pagination`, while a job's logs stay readable when they run into the thousands.
- **Include logs in the detail response** — rejected: diverges from the bull-board `{ job, status }` shape and couples detail fetches to log volume.
- **Unpaginated passthrough like bull-board** — rejected: the ticket's acceptance criteria require paginated logs.

**Consequences**

- The logs endpoint 404s on an unknown job (bull-board's does not) — a deliberate tightening so a stale detail view cannot silently read logs for a deleted job id.
- Logs are served newest-first (bullmq's `getJobLogs(..., asc = false)`), matching how the completed/failed jobs lists are ordered; bull-board shows them oldest-first.
- Route registration order matters: `/api/queues/:queueName/jobs` is registered before `/api/queues/:queueName/:jobId` so the literal `jobs` segment wins over being read as a job id.

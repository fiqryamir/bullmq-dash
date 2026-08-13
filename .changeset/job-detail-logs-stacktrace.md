---
'@bullmq-dash/api': minor
'@bullmq-dash/ui': minor
---

Job detail view: `GET /api/queues/:queueName/:jobId` returns the job's data, options, progress, attempts, stacktrace, and timestamps (mirroring bull-board's `{ job, status }` shape), and `GET /api/queues/:queueName/:jobId/logs` pages the job's log rows newest-first (`page`, `logsPerPage`) with a total count. Clicking a job row in the jobs list opens the detail view showing data, options, failed reason, stacktrace, return value, and paginated logs.

---
'@bullmq-dash/api': minor
'@bullmq-dash/ui': minor
---

Per-queue jobs view: `GET /api/queues/:queueName/jobs` pages BullMQ's `getJobs` for one state (`status`, `page`, `jobsPerPage`), and the UI opens a queue's jobs list with a six-state switcher (waiting, active, completed, failed, delayed, paused), a TanStack Table + Virtual job table (id, name, state, progress, attempts), and pagination. On BullMQ v6, the paused tab shows a paused queue's waiting jobs.

---
'@bullmq-dash/api': minor
'@bullmq-dash/ui': minor
---

Schedulers, workers and Redis stats views complete the bull-board parity
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

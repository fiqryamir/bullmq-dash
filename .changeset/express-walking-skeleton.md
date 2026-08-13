---
'@bullmq-dash/api': minor
'@bullmq-dash/express': minor
---

Express walking skeleton: `BullMQAdapter` wraps a BullMQ `Queue`, and the new `@bullmq-dash/express` server adapter mounts the core's route table on the host app, serving `GET /api/queues` with per-state counts for every registered queue.

# @bullmq-dash/api

## 1.0.0

### Minor Changes

- 65d752a: Express walking skeleton: `BullMQAdapter` wraps a BullMQ `Queue`, and the new `@bullmq-dash/express` server adapter mounts the core's route table on the host app, serving `GET /api/queues` with per-state counts for every registered queue.

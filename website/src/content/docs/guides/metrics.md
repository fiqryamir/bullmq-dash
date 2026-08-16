---
title: Historical metrics
description: Per-queue throughput, duration and wait time captured from the QueueEvents stream into a dashboard-owned Redis store - with zero worker changes.
---

Historical metrics give each queue a time series of completed and failed job
counts plus average duration and wait time, charted in the dashboard's
metrics tab. Unlike bull-board's beta metrics package - which needs workers
with native metrics enabled and an external recorder process - capture here
is built into the board and needs **zero worker code changes**: the board
derives everything from the `QueueEvents` stream it already consumes for
live updates.

## What is tracked

Per queue, per minute bucket:

- `completed` / `failed` counts
- `durationAvgMs` - time in processing, derived from `active` → `completed`
  timestamps
- `waitAvgMs` - time waiting, derived from `waiting` → `active` timestamps

There is no per-job history in v1 - aggregates only (ADR 0002).

## How capture works

`createBullBoard` wires a metrics capture on every watched queue. The board
listens to the queue's `QueueEvents` (waiting → active → completed/failed)
and increments auto-expiring buckets in a **dashboard-owned Redis keyspace**:

- Key prefix: `bullmq-dash:metrics` by default
- Bucket lifetime: **7 days** by default, after which buckets expire

Because it is event-derived, duration and wait time only capture while the
dashboard is listening. Counts, however, stay complete even while the
dashboard is down: the capture seeds from BullMQ's native per-minute metrics
(`queue.getMetrics`) for the gap, so a restarted dashboard backfills the
counter history it missed.

## Configuration

Metrics capture is always on; the board options only shape the store:

```ts
import { createBullBoard, BullMQAdapter } from '@bullmq-dash/api';

createBullBoard({
  queues: [new BullMQAdapter(queue)],
  serverAdapter,
  options: {
    metrics: {
      // Bucket lifetime in seconds; buckets expire after it (default 7 days).
      retentionSeconds: 14 * 24 * 60 * 60,
      // Keyspace prefix (default "bullmq-dash:metrics").
      prefix: 'my-dash:metrics',
    },
  },
});
```

Both are optional. `BoardOptions.metrics.retentionSeconds` and
`BoardOptions.metrics.prefix` are documented in the
[API reference](/reference).

## Writes

This is the one place the dashboard **writes** to Redis beyond BullMQ's own
keyspace: capture writes its own namespaced keys for every watched queue.
The writes are cheap event-derived increments, and nothing else reads the
keyspace - it is safe to point multiple dashboard instances at the same
Redis (each instance's buckets are additive; the events are idempotent
enough for monitoring). If that is a problem for your environment, that is
what `readOnly` is not for - use a separate prefix instead.

## In the UI

The queue metrics tab renders the bucket series (counts, duration, wait) for
the selected range, with the same quiet accent palette as the rest of the
board. The UI downsamples long ranges for readability; the API returns raw
buckets via `GET /api/queues/:queueName/metrics`.

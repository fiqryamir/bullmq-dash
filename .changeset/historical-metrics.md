---
'@bullmq-dash/api': minor
'@bullmq-dash/ui': minor
---

Historical metrics for queues: `GET /api/queues/:queueName/metrics` serves
per-minute buckets — completed/failed counts plus duration and wait averages
— over a 24h window (clamped to 7d, the store's default retention).

`createBullBoard` now runs an always-on capture per watched queue: a
QueueEvents listener (own duplicate connection, honors the queue's Redis key
prefix) turns the waiting→active→completed/failed stream into auto-expiring
minute bucket hashes under `bullmq-dash:metrics:*`, configurable via
`options.metrics.{retentionSeconds,prefix}`; the board returns a
`closeMetrics()` teardown. The endpoint merges BullMQ's native counters so
downtime while the dashboard is down still shows — note those only record
when the embedded host's workers opt in (`maxMetricsSize` on v5 queues,
`metrics.maxDataPoints` on v6 workers).

The UI adds a per-queue metrics view (`uiConfig.showMetrics === false`
hides it): counts/duration/wait line charts over 24h or 7d, token-based
colors, a summary line, and a data-table fallback for screen readers and
no-JS environments.

Fixed along the way: the store now binds to the first captured queue's
client (previously writes were silently dropped) and registers its Lua
script on BullMQ v6's adapted clients (previously `runCommand` failed on
the first write).

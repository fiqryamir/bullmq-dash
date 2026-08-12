# Historical metrics live in a dashboard-owned Redis store, captured from QueueEvents

bullmq-dash v1's historical metrics persist in a **dashboard-owned Redis side store** (namespaced, auto-expiring time buckets, 7-day default retention) rather than a SQL database, and duration/wait-time are **derived from the QueueEvents stream** (waiting→active→completed timestamps) rather than worker-side telemetry hooks. This gives real per-queue aggregate history (counts, duration/latency, wait time) with **zero worker code changes** — the gap bull-board's beta metrics leaves open (it needs worker-side recorder config and only renders daily charts).

**Considered Options**

- **Redis side store** — adopted: no new infrastructure, same dependency as BullMQ itself; auto-expiring buckets bound the cost.
- **SQL side store** — rejected: a dashboard package shouldn't drag a database into the host's stack.
- **Native-only / Prometheus export** — rejected: no real history; the differentiator disappears.
- **Worker telemetry hooks for capture** — rejected as the default: forces users to modify worker code; QueueEvents is already consumed for live updates. (Telemetry hooks may become an optional enrichment later.)

**Consequences**

- The dashboard **writes** to Redis (metrics capture is always on for every watched queue) — embedded hosts should know; writes are cheap event-derived increments.
- Counts stay complete even while the dashboard is down (workers feed BullMQ's native `getMetrics`); duration/wait-time only capture while the dashboard listens.
- Per-job history is out of v1 — aggregates only.

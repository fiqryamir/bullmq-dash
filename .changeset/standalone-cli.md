---
'@bullmq-dash/standalone': minor
---

New `@bullmq-dash/standalone` package: the `bullmq-dash` bin booting a ready dashboard server with zero config - every queue on the Redis connection (optional allow-list, exact match), defaults localhost:3000 with full write actions and no auth (v1). Redis connection and server settings resolve with flags > env vars > JSON config file (`--config` / `BULLMQ_DASH_CONFIG`) > defaults. A Playwright smoke suite drives the built bin in CI (open dashboard, browse queue, search a job); flow-view and metrics-view assertions land with their own tickets (#28, #29).

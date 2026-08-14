---
'@bullmq-dash/standalone': minor
---

New `@bullmq-dash/standalone` package: the `bullmq-dash` bin booting a ready dashboard server with zero config - every queue on the Redis connection (optional `--queues` allow-list), defaults localhost:3000 with full write actions and no auth (v1). Redis connection and server settings resolve with flags > env vars > JSON config file (`--config` / `BULLMQ_DASH_CONFIG`) > defaults. The package also exports `startStandaloneServer` for programmatic use, and ships a Playwright smoke suite (open dashboard, browse queue, search a job) driven against the built bin.

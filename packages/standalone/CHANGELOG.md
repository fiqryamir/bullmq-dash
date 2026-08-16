# @bullmq-dash/standalone

## 2.0.0

### Minor Changes

- 0685938: New `@bullmq-dash/standalone` package: the `bullmq-dash` bin booting a ready dashboard server with zero config - every queue on the Redis connection (optional allow-list, exact match), defaults localhost:3000 with full write actions and no auth (v1). Redis connection and server settings resolve with flags > env vars > JSON config file (`--config` / `BULLMQ_DASH_CONFIG`) > defaults. A Playwright smoke suite drives the built bin in CI (open dashboard, browse queue, search a job); flow-view and metrics-view assertions land with their own tickets (#28, #29).

### Patch Changes

- Updated dependencies [b224085]
- Updated dependencies [1e85a0a]
- Updated dependencies [f0bbc91]
- Updated dependencies [79539b3]
- Updated dependencies [41552ba]
- Updated dependencies [dc20e6c]
- Updated dependencies [c5876b7]
- Updated dependencies [ef51d9f]
- Updated dependencies [7428e23]
- Updated dependencies [76ed550]
  - @bullmq-dash/api@2.0.0
  - @bullmq-dash/express@2.0.0
  - @bullmq-dash/ui@2.0.0

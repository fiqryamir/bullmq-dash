# @bullmq-dash/standalone

## 1.0.0-alpha.1

### Minor Changes

- 0685938: New `@bullmq-dash/standalone` package: the `bullmq-dash` bin booting a ready dashboard server with zero config - every queue on the Redis connection (optional allow-list, exact match), defaults localhost:3000 with full write actions and no auth (v1). Redis connection and server settings resolve with flags > env vars > JSON config file (`--config` / `BULLMQ_DASH_CONFIG`) > defaults. A Playwright smoke suite drives the built bin in CI (open dashboard, browse queue, search a job); flow-view and metrics-view assertions land with their own tickets (#28, #29).

### Patch Changes

- fd18a38: Raise the Node floor to `>=22.12.0` across the suite - the docs site's
  toolchain (Astro 6 / Starlight 0.40) brings in `@astrojs/prism@4`, which
  requires Node 22.12+, and the repo's `engine-strict` setting makes that a
  hard install requirement. No package code changes.
- a83c382: The CLI's flag and environment-variable surface is now exported from
  `config.ts` (`CLI_OPTIONS`, `CLI_ENV_VARS`, `FLAGS_WITHOUT_ENV_VAR`) and
  re-exported from the package entry, and the config resolver reads env vars
  through that single mapping - so the `--help` text, the docs site's
  standalone guide, and the implementation cannot drift. No behavioral
  change.
- Updated dependencies [fd18a38]
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
  - @bullmq-dash/api@1.0.0-alpha.1
  - @bullmq-dash/express@1.0.0-alpha.1
  - @bullmq-dash/ui@1.0.0-alpha.1

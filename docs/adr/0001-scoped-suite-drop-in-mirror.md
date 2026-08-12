# Ship as `@bullmq-dash/*` with a drop-in mirror of bull-board's API

bullmq-dash v1 ships as a scoped pnpm monorepo suite (`@bullmq-dash/api`, `/ui`, `/express`, `/fastify`, `/nestjs`, `/standalone`) whose core API is a **drop-in mirror** of `@bull-board/api` v8 — same names and shapes (`createBullBoard({ queues, serverAdapter })`, `BullMQAdapter`, the `IServerAdapter` interface, `setQueues`/`replaceQueues`/`addQueue`/`removeQueue` return). We chose mirroring over a clean-room API because the migration story is the moat: bull-board users (the old deprecated `bull-board` still pulls ~31k weekly downloads) can adopt the differentiator features (standalone mode, job search, flow viz, historical metrics) with minimal code changes.

**Considered Options**

- **Drop-in mirror** — adopted. bull-board is MIT, so name copying is legal; compatibility maximizes adoption.
- **Mirror the architecture, own names** — rejected: breaks the migration story for no real gain.
- **Clean-room API** — rejected: we'd compete on API design against an incumbent while trying to compete on features.

**Consequences**

- Public API compatibility with `@bull-board/api` v8 is a v1 contract; renaming later is breaking.
- The npm name `bullmq-dash` is unavailable (taken by an unrelated terminal-UI dashboard since Jan 2026) — hence the `@bullmq-dash` scope. The GitHub repo keeps the name `bullmq-dash`.
- The core stays framework-free: the standalone CLI lives in its own `/standalone` package (depends on `/api` + `/express`), not in the core.
- Suite packages are version-locked together, mirroring bull-board's practice.

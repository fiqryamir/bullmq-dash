---
title: Migrating from bull-board
description: Move a bull-board dashboard to bullmq-dash - the core API is a drop-in mirror, with the gaps closed as new features.
---

bullmq-dash's core is a **drop-in mirror** of `@bull-board/api` v8: the same
names, the same shapes, the same return values. Moving a board is a package
swap plus a handful of deliberate differences. In exchange you get the gaps
bull-board never closed: job search, a whole-queue flow graph, a standalone
server, and historical metrics with zero worker changes.

## Step 1 - swap the packages

| bull-board | bullmq-dash |
| --- | --- |
| `@bull-board/api` | `@bullmq-dash/api` |
| `@bull-board/express` | `@bullmq-dash/express` |
| `@bull-board/fastify` | `@bullmq-dash/fastify` |
| `@bull-board/nestjs` | `@bullmq-dash/nestjs` |
| `@bull-board/ui` | `@bullmq-dash/ui` (pulled in automatically) |

## Step 2 - change the imports

The call site stays the same:

```ts
// before
import { createBullBoard, BullMQAdapter } from '@bull-board/api';
import { ExpressAdapter } from '@bull-board/express';

// after
import { createBullBoard, BullMQAdapter } from '@bullmq-dash/api';
import { ExpressAdapter } from '@bullmq-dash/express';
```

`createBullBoard({ queues, serverAdapter, options })`, the `BullMQAdapter`
queue adapter, the `IServerAdapter` contract, and the returned
`setQueues` / `replaceQueues` / `addQueue` / `removeQueue` functions all
behave as before. Adapter options (`readOnlyMode`, `allowRetries`,
`displayName`, `prefix`, formatters, visibility guards) work the same way.

## Step 3 - adjust for the differences

These are deliberate (each is an ADR; see `docs/adr/` in the repo):

- **BullMQ only.** v1 ships `BullMQAdapter` but no `BullAdapter` - the Bull v3
  queue library is not supported. Stay on bull-board if you run Bull.
- **Stricter 404s.** The job detail endpoint 404s on an unknown job (bull-board
  does not), and so does the logs endpoint - a stale view cannot silently read
  deleted jobs.
- **Paginated logs.** `GET /api/queues/:queueName/:jobId/logs` returns
  `{ logs, count }` plus a `pagination` object, newest-first. Clients that
  ignore `pagination` are wire-compatible.
- **Explicit remove routes.** `PUT .../:jobId/remove` (409 while active) and
  bulk `PUT .../remove/:queueStatus` are added; the old per-job `clean` route
  stays as an alias for route-table parity.
- **Board-level `readOnly`.** `options.readOnly` on `createBullBoard` gates
  every mutation end to end (403 from the API, controls hidden in the UI) -
  the same knob you already know per-queue as `readOnlyMode`.
- **`closeMetrics()`.** The board object adds `closeMetrics()` so embedded
  hosts that shut down cleanly can stop the metrics capture's listeners.
  bull-board's board has no teardown; this one is optional, not breaking.
- **Different defaults.** The board title defaults to `bullmq-dash`, the
  static route is `/assets`, and the UI is the dark-first search-first shell
  of this project - a visual change, not a breaking one.

## Step 4 - adopt the new features

- **[Job search](/guides/search)** - `/api/search` across queues or
  `/api/queues/:queueName/search`, with a bounded scan and continuation.
- **[Flow view](/guides/flow)** - the per-job flow route mirrors bull-board's;
  the queue-level graph route is new.
- **[Historical metrics](/guides/metrics)** - on by default for every watched
  queue, stored in a dashboard-owned Redis keyspace; configure via
  `options.metrics` (`retentionSeconds`, `prefix`).
- **[Standalone](/guides/standalone)** - if you were looking for a runnable
  server or Docker image, that is the `bullmq-dash` bin.
- **Workers and schedulers views, i18n locales** - already in bull-board's
  orbit, available here out of the box.

## Rollback

Because the wire contract mirrors bull-board, going back is the same package
swap in reverse. No queue or Redis data is written except the metrics
keyspace (`bullmq-dash:metrics:*`), which the standalone and embedded modes
only write to, never read from other tools.

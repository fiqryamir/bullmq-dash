---
title: Express adapter
description: Mount the bullmq-dash dashboard in an Express 4 or 5 application with the ExpressAdapter.
---

`@bullmq-dash/express` mounts the dashboard into an existing Express
application (Express 4 or 5).

```bash
pnpm add @bullmq-dash/api @bullmq-dash/express
```

## Minimal setup

```ts
import { createBullBoard, BullMQAdapter } from '@bullmq-dash/api';
import { ExpressAdapter } from '@bullmq-dash/express';
import { Queue } from 'bullmq';
import express from 'express';

const serverAdapter = new ExpressAdapter();

createBullBoard({
  queues: [new BullMQAdapter(new Queue('emails'))],
  serverAdapter,
});

const app = express();
app.use('/dashboard', serverAdapter.getRouter());
app.listen(3000);
```

The dashboard now lives at `/dashboard`. `createBullBoard` wires the adapter:
the entry view, the `/assets` static route, the `/api` routes, and a JSON error
handler.

## Base path

Mount at a sub-path with `setBasePath` - required if the dashboard is served
from behind a path prefix, so links and asset URLs resolve correctly:

```ts
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/dashboard');

createBullBoard({ queues, serverAdapter });
```

Call it before `createBullBoard` and before mounting the router.

## Read-only boards

Pass `readOnly: true` in the board options to disable every mutation. The API
answers each mutating route with `403` and the UI hides the action controls:

```ts
createBullBoard({
  queues,
  serverAdapter,
  options: { readOnly: true },
});
```

Per-queue `readOnlyMode` on the adapter works the same way for a single queue.

## Notes

- The adapter creates its own `express()` app with a JSON API router; it does
  not touch your app's middleware stack.
- In production, put the dashboard behind your existing authentication -
  the v1 board ships no auth of its own.
- The dashboard serves its own React UI bundle; there is nothing to build
  client-side.

See the [API reference](/reference) for `createBullBoard`, `BullMQAdapter`
and `BoardOptions`.

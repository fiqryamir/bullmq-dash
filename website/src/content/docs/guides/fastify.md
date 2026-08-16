---
title: Fastify adapter
description: Mount the bullmq-dash dashboard in a Fastify 5 application with the FastifyAdapter.
---

`@bullmq-dash/fastify` mounts the dashboard into an existing Fastify 5
application.

```bash
pnpm add @bullmq-dash/api @bullmq-dash/fastify
```

## Minimal setup

The `FastifyAdapter` records the board wiring, then exposes it as a
`registerPlugin` you register on your Fastify instance:

```ts
import { createBullBoard, BullMQAdapter } from '@bullmq-dash/api';
import { FastifyAdapter } from '@bullmq-dash/fastify';
import { Queue } from 'bullmq';
import Fastify from 'fastify';

const serverAdapter = new FastifyAdapter();

createBullBoard({
  queues: [new BullMQAdapter(new Queue('emails'))],
  serverAdapter,
});

const app = Fastify();
app.register(serverAdapter.registerPlugin());
app.listen({ port: 3000 });
```

The dashboard lives at `/`. The plugin registers `@fastify/view` (ejs) and
`@fastify/static` for the UI bundle, mounts the entry view, the `/api` routes
and the error handler.

## Base path

Serve at a sub-path with `setBasePath` (or the plugin's `prefix` option -
whichever is set first wins):

```ts
const serverAdapter = new FastifyAdapter();
serverAdapter.setBasePath('/dashboard');
createBullBoard({ queues, serverAdapter });

const app = Fastify();
app.register(serverAdapter.registerPlugin(), { prefix: '/dashboard' });
```

## Ordering

Every `set*` call on the adapter must happen before `registerPlugin()` - the
plugin throws if the wiring is incomplete:

```
Please call 'setStaticPath' before using 'registerPlugin'
```

The easiest way to stay correct is to call `createBullBoard` right after
constructing the adapter, exactly as in the minimal setup above.

## Read-only boards

Pass `readOnly: true` in the board options to disable every mutation - the API
answers each mutating route with `403` and the UI hides the action controls:

```ts
createBullBoard({
  queues,
  serverAdapter,
  options: { readOnly: true },
});
```

See the [API reference](/reference) for `createBullBoard`, `BullMQAdapter`
and `BoardOptions`.

---
title: Quick start
description: Get a bullmq-dash dashboard running in two minutes - standalone with one command, or embedded in your own server.
---

bullmq-dash runs in two modes. If you just want to look at a Redis instance,
[run it standalone](/guides/standalone). If you want the dashboard mounted in
your own application, [embed it](/guides/express) through a server adapter.

Both modes need a reachable Redis server and BullMQ `>=5.79.2 <7`.

## Standalone

```bash
pnpm add @bullmq-dash/standalone
npx bullmq-dash
```

That boots a dashboard on `http://localhost:3000` showing every queue on
`localhost:6379`. Point it at another Redis instance with flags or the
environment:

```bash
npx bullmq-dash --redis-host redis.internal --redis-port 6380 --queues emails,reports
```

Read the [standalone guide](/guides/standalone) for every flag, environment
variable, JSON config file and the queue allow-list.

## Embedded

Install the core and one server adapter - Express here, though
[Fastify](/guides/fastify) and [NestJS](/guides/nestjs) work the same way:

```bash
pnpm add @bullmq-dash/api @bullmq-dash/express
```

```ts
import { createBullBoard, BullMQAdapter } from '@bullmq-dash/api';
import { ExpressAdapter } from '@bullmq-dash/express';
import { Queue } from 'bullmq';

const serverAdapter = new ExpressAdapter();

createBullBoard({
  queues: [new BullMQAdapter(new Queue('emails'))],
  serverAdapter,
});

const app = express();
app.use('/dashboard', serverAdapter.getRouter());
app.listen(3000);
```

Open `http://localhost:3000/dashboard`. That is the whole integration: the core
mirrors bull-board's API (see the [migration guide](/guides/migration)), so
any existing `createBullBoard` setup moves over by changing the package names.

## What you get

- Queue list with live counts and per-state job lists, plus workers and
  schedulers
- Job detail with data, return values, logs (paginated), and retries
- [Job search](/guides/search) across every queue or scoped to one
- [Flow view](/guides/flow) - the whole live pipeline as a graph
- [Historical metrics](/guides/metrics) - per-queue throughput, duration and
  wait time, captured with zero worker changes
- Dark and light themes, with `readOnly` mode to disable every mutation

The [API reference](/reference) documents the full core surface.

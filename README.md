# bullmq-dash

A modern BullMQ dashboard UI — open-source, embeddable, and standalone.

bullmq-dash is **BullMQ DevTools**: it helps developers see what happened to
a job from the evidence BullMQ still retains. Job detail turns that retained
evidence into a job's last-known story — state and latest outcome first,
then attempts, logs, stack trace, payload and result, and flow relationships,
with every missing fact named as an explicit gap instead of an empty value.
Around it: queue lists with live counts, job search across every queue,
whole-queue flow graphs, and historical queue metrics — embeddable in your Express,
Fastify or NestJS app, or runnable as its own server with the `bullmq-dash`
bin. The core API is a [drop-in mirror of bull-board](https://fiqryamir.github.io/bullmq-dash/guides/migration/),
with the gaps that ecosystem left open for years filled in.

The DevTools read only what BullMQ and Redis still hold: no complete
lifecycle history, no durable per-attempt record, no root-cause proof, no
cross-entity diagnosis, and no instrumentation in your workers.

## Docs

Documentation lives on the [docs site](https://fiqryamir.github.io/bullmq-dash/):

- [Quick start](https://fiqryamir.github.io/bullmq-dash/guides/quick-start/)
- [Standalone CLI](https://fiqryamir.github.io/bullmq-dash/guides/standalone/) — flags, env vars, JSON config, queue allow-list
- [Express](https://fiqryamir.github.io/bullmq-dash/guides/express/) / [Fastify](https://fiqryamir.github.io/bullmq-dash/guides/fastify/) / [NestJS](https://fiqryamir.github.io/bullmq-dash/guides/nestjs/) adapters
- [Migrating from bull-board](https://fiqryamir.github.io/bullmq-dash/guides/migration/)
- [Job detail](https://fiqryamir.github.io/bullmq-dash/guides/job-detail/) / [Job search](https://fiqryamir.github.io/bullmq-dash/guides/search/) / [Flow view](https://fiqryamir.github.io/bullmq-dash/guides/flow/) / [Historical metrics](https://fiqryamir.github.io/bullmq-dash/guides/metrics/)
- [API reference](https://fiqryamir.github.io/bullmq-dash/reference/) (TypeDoc, generated from the core's types)

## Quick start

```bash
pnpm add @bullmq-dash/standalone
npx bullmq-dash
```

Open <http://localhost:3000> — the dashboard discovers every queue on
`localhost:6379` and binds `localhost` by default (no auth in v1; do not
expose it publicly).

## Packages

| Package | Role |
| --- | --- |
| `@bullmq-dash/api` | Framework-free core — `createBullBoard`, `BullMQAdapter`, the REST contract |
| `@bullmq-dash/ui` | The React SPA, bundled into the adapters |
| `@bullmq-dash/express` | Express 4/5 adapter |
| `@bullmq-dash/fastify` | Fastify 5 adapter |
| `@bullmq-dash/nestjs` | NestJS module (`BullBoardModule`) |
| `@bullmq-dash/standalone` | The `bullmq-dash` bin — zero-config standalone server |

## Development

pnpm monorepo, Node >= 22.12:

```bash
pnpm install
pnpm run typecheck   # all packages + the docs site
pnpm run lint
pnpm -r test         # needs a Redis on localhost:6379
pnpm run build
pnpm --filter @bullmq-dash/website dev   # run the docs site locally
```

To inspect a repeatable local demo with schedulers, metrics, and a live worker,
run Redis and the seed command in separate terminals:

```bash
# terminal 1
npx bullmq-dash

# terminal 2
pnpm demo:seed
```

The seed command prepares the demo queues, waits for the dashboard to discover
them, processes a fixed batch of completed and failed metric jobs, and keeps
`demo-worker` connected for the Workers view. Press Ctrl+C to stop the worker;
the seeded queue data remains in Redis. Use `BULLMQ_DASH_URL` when the
dashboard is not at `http://localhost:3000`.

## License

MIT — see [LICENSE](LICENSE).

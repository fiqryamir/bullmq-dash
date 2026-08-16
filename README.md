# bullmq-dash

A modern BullMQ dashboard UI — open-source, embeddable, and standalone.

Monitor and manage BullMQ queues with a calm, dark-first UI: queue lists with
live counts, job detail with paginated logs, job search across every queue,
whole-queue flow graphs, and historical metrics — embeddable in your Express,
Fastify or NestJS app, or runnable as its own server with the `bullmq-dash`
bin. The core API is a [drop-in mirror of bull-board](https://fiqryamir.github.io/bullmq-dash/guides/migration/),
with the gaps that ecosystem left open for years filled in.

## Docs

Documentation lives on the [docs site](https://fiqryamir.github.io/bullmq-dash/):

- [Quick start](https://fiqryamir.github.io/bullmq-dash/guides/quick-start/)
- [Standalone CLI](https://fiqryamir.github.io/bullmq-dash/guides/standalone/) — flags, env vars, JSON config, queue allow-list
- [Express](https://fiqryamir.github.io/bullmq-dash/guides/express/) / [Fastify](https://fiqryamir.github.io/bullmq-dash/guides/fastify/) / [NestJS](https://fiqryamir.github.io/bullmq-dash/guides/nestjs/) adapters
- [Migrating from bull-board](https://fiqryamir.github.io/bullmq-dash/guides/migration/)
- [Job search](https://fiqryamir.github.io/bullmq-dash/guides/search/) / [Flow view](https://fiqryamir.github.io/bullmq-dash/guides/flow/) / [Historical metrics](https://fiqryamir.github.io/bullmq-dash/guides/metrics/)
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

pnpm monorepo, Node >= 20:

```bash
pnpm install
pnpm run typecheck   # all packages + the docs site
pnpm run lint
pnpm -r test         # needs a Redis on localhost:6379
pnpm run build
pnpm --filter @bullmq-dash/website dev   # run the docs site locally
```

## License

MIT — see [LICENSE](LICENSE).

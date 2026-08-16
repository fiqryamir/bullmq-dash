---
title: Standalone
description: Run bullmq-dash as its own server with the bullmq-dash CLI - flags, environment variables, JSON config file and the queue allow-list.
---

The `bullmq-dash` bin is a ready-to-run BullMQ dashboard server: it connects to
Redis, discovers every queue, and serves the dashboard on a local port - zero
embedding code.

```bash
pnpm add @bullmq-dash/standalone
npx bullmq-dash
```

Prints something like:

```
bullmq-dash 1.0.0 listening on http://localhost:3000
```

## Security note

The v1 server ships **no auth**. It binds `localhost` by default - do not
expose it publicly. `npx bullmq-dash --host 0.0.0.0` is how you would, and
should not.

## Configuration

Configuration resolves in this order:

> Flags win over env vars, which win over the config file.

### Flags

| Flag | Description | Default |
| --- | --- | --- |
| `--config <path>` | JSON config file (also: `BULLMQ_DASH_CONFIG` env) | |
| `--host <host>` | Host to bind | `localhost` |
| `--port <port>` | Port to listen on | `3000` |
| `--redis-host <host>` | Redis host | `localhost` |
| `--redis-port <port>` | Redis port | `6379` |
| `--redis-password <pass>` | Redis password | |
| `--redis-db <db>` | Redis database index | `0` |
| `--redis-prefix <prefix>` | BullMQ key prefix | `bull` |
| `--queues <a,b,c>` | Allow-list of queue names to show | all |
| `--help` | Show help | |
| `--version` | Show the version | |

### Environment variables

Every flag has a matching environment variable:

| Variable | Same as |
| --- | --- |
| `BULLMQ_DASH_CONFIG` | `--config` |
| `BULLMQ_DASH_HOST` | `--host` |
| `BULLMQ_DASH_PORT` | `--port` |
| `REDIS_HOST` | `--redis-host` |
| `REDIS_PORT` | `--redis-port` |
| `REDIS_PASSWORD` | `--redis-password` |
| `REDIS_DB` | `--redis-db` |
| `REDIS_PREFIX` | `--redis-prefix` |
| `BULLMQ_DASH_QUEUES` | `--queues` (comma-separated allow-list) |

### JSON config file

Pass a config file with `--config` or `BULLMQ_DASH_CONFIG`. Every field is
optional:

```json
{
  "host": "localhost",
  "port": 3000,
  "redis": {
    "host": "localhost",
    "port": 6379,
    "password": "...",
    "db": 0,
    "prefix": "bull"
  },
  "queues": ["emails", "reports"]
}
```

## The queue allow-list

By default the server shows **every queue** found on the Redis connection -
the `--queues` help text reads `default: all`. To narrow it, pass a list - a comma
separated flag value, the `BULLMQ_DASH_QUEUES` env var, or the `queues` array
in the config file.

The allow-list wins wholesale: an explicitly present list is used exactly as
given - even an **empty list shows nothing**, never everything. A queue on the
allow-list is shown even before it has any keys yet, so a fresh queue is
visible immediately.

## Queue discovery

Without an allow-list the server scans the BullMQ keyspace
(`<prefix>:*:meta` keys) for every queue on the connection - BullMQ v6 has no
queue-registry API, so the meta keys are the ground truth. A non-default
`--redis-prefix` is honored in both the discovery scan and the queues it
opens.

## What it runs

Internally the bin is the [Express adapter](/guides/express) plus the
[core](/reference), with one `BullMQAdapter` per queue. Everything the
embedded mode offers - job search, flow view, historical metrics, all queue
and job actions - works identically here. The board is writable by default;
there is no auth, so treat `localhost` binding as the guard.

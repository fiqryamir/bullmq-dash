# bullmq-dash

A modern, open-source BullMQ dashboard UI package — embeddable in Node apps and runnable standalone.

## Language

**Standalone mode**:
Running the dashboard as its own server via the `bullmq-dash` CLI — zero embedding code required.
_Avoid_: Headless mode, detached mode

**Embedded mode**:
Serving the dashboard from inside an existing Node app through a server adapter (Express, Fastify, NestJS).
_Avoid_: Integrated mode

**Server adapter**:
The per-framework bridge that mounts the dashboard's HTTP routes and UI assets into a host app.
_Avoid_: Plugin, connector

**Queue adapter**:
The wrapper that adapts a BullMQ `Queue` (and supporting classes) to the dashboard core's view of a queue.
_Avoid_: Provider, driver

**Metrics store**:
The dashboard-owned Redis keyspace holding per-queue aggregate metric history (counts, duration, wait time) as auto-expiring time buckets.
_Avoid_: Metrics database, time series DB

**Job search**:
Querying jobs by id or name across all queues (or scoped to one) through the core's search endpoint, filtered by state.
_Avoid_: Find jobs, job query

**Flow view**:
The per-queue graph of job flows — root jobs expanded into their child trees, state-colored; clicking a node opens the job's detail.
_Avoid_: Flow diagram, pipeline map

**Design token**:
A named, reusable value in the design system — color, spacing, type size, radius, elevation — exposed as a CSS custom property (`--dash-*`) in `tokens.css`.
_Avoid_: Style variable, theme variable

**Primitive token**:
The theme-independent layer of the design system — full ramps (warm stone neutrals, accent) and scale steps that both themes draw from.
_Avoid_: Raw token, base token

**Semantic token**:
The theme-dependent layer of the design system — named by use, not value (`--dash-surface`, `--dash-text-muted`), pointing at primitives; dark and light each define their own.
_Avoid_: Component token, role token

**Recipe**:
A styled CSS class (`.dash-*`) composing tokens over an unstyled Base UI primitive — button, chip, tab, table, panel, code, dialog, input.
_Avoid_: Styled component

**State color**:
The per-job-state semantic colors — waiting, active, delayed, completed, failed, paused — carried by chips and tabs; the only palette elements that compete with the accent.
_Avoid_: Status color, job color

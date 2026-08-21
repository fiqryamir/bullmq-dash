# bullmq-dash

A modern, open-source BullMQ dashboard UI package — embeddable in Node apps and runnable standalone.

## Language

**BullMQ DevTools**:
The developer-focused product category for bullmq-dash: inspecting and debugging BullMQ jobs from retained evidence.
_Avoid_: Observability platform, incident response system

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

**Retained evidence**:
The BullMQ and Redis facts still available for a job at inspection time; it may omit lifecycle history, earlier attempt details, or data removed by cleanup.
_Avoid_: Execution history, trace

**Job search**:
Querying jobs by id or name across all queues (or scoped to one) through the core's search endpoint, filtered by state.
_Avoid_: Find jobs, job query

**Job dossier**:
The canonical evidence surface for one retained BullMQ job, publicly labeled Job detail, combining its job state, diagnostic summary, attempt evidence, logs, relationships, and evidence gaps; reachable from existing job contexts.
_Avoid_: Investigation page, timeline

**Evidence ledger**:
The Job detail hierarchy that leads with the diagnostic summary, indexes evidence by retention, and opens one evidence thread at a time; it is the same surface as the job dossier.
_Avoid_: Execution timeline, incident view

**Attempt**:
One processing run counted on a BullMQ job; the aggregate count can outlive detailed evidence for earlier runs.
_Avoid_: Lifecycle transition, retry event

**Diagnostic summary**:
A verdict-first, plain-language account of what the retained evidence says about a job, including its last-known outcome, available timing, worker, and attempt evidence, explicit gaps, and the next related evidence to inspect.
_Avoid_: Root cause, full history

**Evidence gap**:
An explicit indication that a fact cannot be established from retained BullMQ or Redis data; it is not an empty, zero, or healthy value.
_Avoid_: Missing field, unknown status

**Last-known story**:
The bounded explanation of a job from retained evidence; it does not imply complete lifecycle reconstruction or a proven root cause.
_Avoid_: Execution timeline, full lifecycle

**Incident**:
A future-only concept for a time-bounded abnormal condition spanning multiple jobs or BullMQ entities.
_Avoid_: Failed job, job state

**Health**:
A future-only concept for an aggregate current condition of a queue, worker, or Flow, not a single job's state or diagnostic summary.
_Avoid_: Job state, diagnostic summary

**Time-to-explanation**:
The elapsed time from starting a job investigation to stating its bounded last-known story; it does not measure time to root cause or time to first click.
_Avoid_: Time-to-root-cause, time-to-first-click

**Truth rubric**:
The four-part check that a diagnostic explanation states the job state and outcome, attempt and latest evidence, evidence gaps, and next inspection; prohibited full-history or root-cause claims fail it.
_Avoid_: Preference score, field recall

**Bounded context link**:
A route or identifier to related queue, worker, or Flow context that preserves investigation context without claiming cross-entity diagnosis.
_Avoid_: Correlation, health signal

**Flow view**:
The per-queue graph of job flows — root jobs expanded into their child trees, state-colored; clicking a node opens its job dossier.
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

**Job state**:
The BullMQ lifecycle value carried by a job — waiting, active, delayed, completed, failed, or paused — used for filtering, explanation, and state color.
_Avoid_: Job status

**State color**:
The per-job-state semantic colors — waiting, active, delayed, completed, failed, paused — carried by chips and tabs; the only palette elements that compete with the accent.
_Avoid_: Status color, job color

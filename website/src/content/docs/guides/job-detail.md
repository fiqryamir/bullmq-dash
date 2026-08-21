---
title: Job detail
description: Open a known job and read its last-known story from the evidence BullMQ still retains - state and outcome first, then attempts, logs, payload, and relationships.
---

Job detail answers one question: **what happened to this job?** bullmq-dash
is BullMQ DevTools - it helps you see what happened to a job from the
evidence BullMQ still retains, and Job detail is where that evidence becomes
a **last-known story**: what state the job is in, what its latest retained
outcome was, which facts are still on file, and which are gone.

## One surface

The UI label is **Job detail**. Strategy docs call the same surface the
**job dossier**, and its layout the **Evidence ledger** - one route, one
page, three names for the same thing. There is no separate debugging view to
keep in sync: every entry route lands here, for every retained job state -
`waiting`, `active`, `delayed`, `completed`, `failed`, `paused`.

## Three ways in

- **Job search** - open a result straight into its dossier, search term and
  filters preserved ([search guide](/guides/search)).
- **A queue's jobs table** - open any row; the queue, state tab, and pager
  you came from stay intact behind back navigation.
- **A Flow node** - click through to that job's page with the graph one back
  navigation away ([flow guide](/guides/flow)).

Whichever route you take, the source context survives: back returns to the
queue, search, or Flow view you left.

## Reading the evidence

The page leads with a **diagnostic summary** - the verdict before the raw
fields: the job's state and latest retained outcome in plain language, the
attempt count, what the latest retained run looked like, and where the
evidence thins out. It refreshes with the board's existing polling, so an
active job can turn completed or failed without a route change.

Below it, an **evidence index** lists the threads the retained data can
support; opening one shows that thread alone:

- **Attempts** - one aggregate count plus the latest retained processing
  run: its timing and worker when BullMQ still holds them. Earlier attempts
  exist only as that count - BullMQ keeps no per-attempt history, so the
  page never renders a fabricated timeline of runs it does not have.
- **Logs** - the retained log lines, paginated newest-first.
- **Stack trace** - where the latest retained error was thrown. It locates
  the reported failure; it is not a claim about why the system around it
  failed.
- **Data and result** - the job's input `data`, `opts`, and return value
  when retained, so you can compare what went in with what came out.
- **Relationships** - parent and children when the flow is still retained,
  each a link into the same surface, not a graph re-render.

## Evidence gaps

When a fact cannot be established from retained BullMQ or Redis data, the
page says so explicitly. A missing worker, an unknown queue wait, logs lost
to cleanup, earlier attempts whose details are gone - each is named as an
**evidence gap** rather than rendered as zero, empty, or healthy. Gaps are
information: they tell you the answer did not survive, not that nothing
happened.

## Bounded context links

Queue, worker, and Flow destinations linked from the page preserve the
identifiers and route context of the investigation. They are jump-off
points, not correlations: the dashboard does not join them into cross-entity
conclusions about degradation or system-wide condition.

## Actions stay secondary

Retry, remove, promote, and the other existing mutations remain available
but below the evidence: investigation first, remediation second. With
`readOnly` enabled the mutating controls disappear end to end, as everywhere
else on the board.

## What the evidence cannot tell you

The page reads only what BullMQ and Redis still hold, so it makes no promise
beyond that:

- No complete lifecycle reconstruction - BullMQ keeps transitions, not
  history; earlier states are gone once they pass.
- No durable per-attempt record - the attempt count outlives the details of
  the runs it counts.
- No root-cause proof - a stack trace locates where an error was thrown; it
  does not explain the system around it.
- No tracing across services, and nothing to install - no instrumentation
  in your workers is required or read.

What remains is a **last-known story**: what the retained evidence supports,
with gaps named. It names no incident timeline and no health score - those
are future concepts reserved for later alphas, not claims this surface
makes.

## Embedded and standalone

The surface is identical in both serving modes - embedded through the
[Express](/guides/express), [Fastify](/guides/fastify) or
[NestJS](/guides/nestjs) adapters, or served by the
[standalone](/guides/standalone) bin. Debugging does not depend on how the
dashboard is deployed.

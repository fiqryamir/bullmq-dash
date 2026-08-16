---
title: Job search
description: Find jobs by id or name across every queue - the scan contract, the response shape, and how to deepen past the caps.
---

Job search finds jobs by **id or name** - case-insensitive substring matches -
across every queue on the board, or scoped to one queue. This is the feature
bull-board's users have asked for since 2020 and never got: BullMQ v6 has no
native search, and a dashboard cannot poke Redis internals. bullmq-dash scans
the state sets through the same adapter seam the jobs list uses, bounded per
request.

## Endpoints

| Endpoint | Scope |
| --- | --- |
| `GET /api/search?term=&status=&start=` | Every visible queue, in registration order |
| `GET /api/queues/:queueName/search?term=&status=&start=` | One queue |

A queue hidden by a visibility guard is never scanned.

## Response

```json
{
  "term": "report",
  "count": 3,
  "totalScanned": 1400,
  "deepen": true,
  "results": [
    { "queue": "emails", "job": { "id": "42", "name": "weekly-report", "data": {}, "opts": {} }, "state": "completed" }
  ]
}
```

- `term` - the search term echoed back.
- `count` - matches returned in this response.
- `totalScanned` - distinct jobs examined by this request.
- `deepen` - true when the scan stopped before searching everything, because
  one of the caps below was hit. More matches may exist.
- `results` - up to the result cap, each with the queue, the job, and the
  state it was found in. Results follow the backing library's per-state
  order; the contract promises matches, not a sort.

## The scan contract

Each queue is scanned as one concatenated sequence of its states, in the
adapter's status order, chunked 100 jobs per `getJobs` call. One request
scans at most **5,000** jobs and returns at most **500** matches; the scan
stops at whichever comes first. `totalScanned` counts what that request
examined.

On BullMQ v6 a paused queue's `paused` view is its waiting jobs, so when both
`waiting` and `paused` are in scope the scan collapses to `waiting` - the
same collapse the jobs list performs, so no job is scanned or reported twice.

## Deepening

When `deepen` is true, request again with `start` set to the accumulated
`totalScanned` of all prior calls; the next scan skips that many jobs of the
sequence:

```ts
let start = 0;
let seen = 0;
do {
  const res = await fetch(
    `/api/search?term=${term}&start=${start}`
  ).then((r) => r.json());
  seen += res.totalScanned;
  start = seen;
  render(res.results);
} while (res.deepen);
```

The continuation re-scans from the offset, so jobs added after the first call
can be re-seen and a job removed mid-search can be skipped past - drift
accepted for a live search UX.

## In the UI

The command palette is the search surface: 300ms debounce, state-chip
filters, a virtualized result list, and automatic continuation fetches when
`deepen` is true. On the home view it searches every queue; inside a queue's
jobs view the same palette mounts scoped to that queue, hitting the
per-queue endpoint and dropping the queue column from its rows.

Search is read-only: `readOnly` does not gate it, and visibility guards apply
as everywhere else.

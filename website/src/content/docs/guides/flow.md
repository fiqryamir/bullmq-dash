---
title: Flow view
description: See the whole live pipeline as a graph - queue-level roots expanded into child trees, plus the per-job flow route that mirrors bull-board.
---

The flow view shows the whole live pipeline of a queue at once: every root
job - plain jobs and flow parents - expanded into its child tree, with
state-colored nodes you can click through to a job's detail. bull-board only
renders the tree on a parent job's detail page; the queue-level graph is the
gap bullmq-dash closes.

## Two endpoints

| Endpoint | What it returns |
| --- | --- |
| `GET /api/queues/:queueName/flow` | The queue-level graph: `{ roots, nodeCount, truncated }` |
| `GET /api/queues/:queueName/:jobId/flow` | The per-job tree, mirroring bull-board's route: `{ nodeId, isFlowNode, flowRoot }` |

Both 404 on unknown queues; the per-job route 404s on unknown jobs, and Bull
queues answer an empty graph (`bullmq-dash` v1 is BullMQ-only).

## The queue graph

Root discovery scans the queue's **live** states - `active`, `waiting`,
`waiting-children` - in bounded windows (200 candidates per state). The last
state matters: a flow parent awaiting its children lives there, and would
otherwise be invisible. Every candidate that carries `opts.parent` is
filtered out - children are covered by their root. Each remaining root is
expanded with `FlowProducer.getFlow` at `depth: 5`.

The response is capped at **200 nodes** across all roots; when the cap or a
discovery window cut something off, `truncated` is true:

```json
{
  "roots": [
    {
      "id": "123",
      "name": "onboard-user",
      "state": "active",
      "progress": 0.5,
      "queueName": "emails",
      "children": [
        { "id": "124", "name": "send-welcome", "state": "completed", "progress": 1, "queueName": "emails", "children": [] }
      ]
    }
  ],
  "nodeCount": 2,
  "truncated": false
}
```

Flows span queues: a child can live in a queue the graph was not opened for.
The UI labels those nodes with their queue and routes clicks to that queue's
job detail when the queue is registered.

## The per-job tree

`GET /api/queues/:queueName/:jobId/flow` mirrors bull-board's route exactly:
walk the job's `opts.parent` chain across queues to the flow root, then
`FlowProducer.getFlow` on the root. `isFlowNode` reports whether the job is
part of a flow at all.

## Reading the graph

Nodes are state-colored with the dashboard's state palette - `waiting`,
`active`, `delayed`, `completed`, `failed`, `paused`, plus
`waiting-children` for parents awaiting children. A plain childless live job
is a single-node root, so the graph is the whole live pipeline, not only
flows. Clicking any node opens that job's detail view.

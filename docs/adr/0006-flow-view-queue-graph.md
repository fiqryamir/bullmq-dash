# The queue-level flow endpoint discovers live roots and caps the graph; the per-job flow route mirrors bull-board's

Flow view in bullmq-dash v1 (issue #28) ships two endpoints. `GET /api/queues/:queueName/:jobId/flow` mirrors bull-board v8's route exactly: walk the job's `opts.parent` chain across queues to the flow root, then `FlowProducer.getFlow` on the root and return `{ nodeId, isFlowNode, flowRoot }` with `FlowNode = { id, name, state, progress, queueName, children }`. `GET /api/queues/:queueName/flow` is the differentiator bull-board lacks: a queue-level graph assembled by scanning the queue's **live** states (`active`, `waiting`, `waiting-children` — the last included because a flow parent awaiting its children lives there and would otherwise be invisible), filtering out every candidate that carries `opts.parent` (children are covered by their root), expanding each remaining root via `getFlow` at `depth: 5`, and capping the response at **200 nodes** across all roots with a `truncated: true` notice. The response is `{ roots: FlowNode[], nodeCount, truncated }`; `truncated` also fires when a discovery scan window (200 candidates per state) was full, since more candidates may exist beyond it. The producer comes from the root's own adapter (`BullMQAdapter.getFlowProducer`, cached per connection/backend in a module WeakMap and never closed, exactly like bull-board), so trees are read from the datastore the queue lives in — including Postgres backends on v6.

**Considered Options**

- **Scan roots, expand per root, cap the response** — adopted: "root discovery across active/waiting, then `getFlow` per root" is the ticket's assembly order; a plain (childless) live job is a single-node root, so the graph is the whole live pipeline, not only flows.
- **Include `waiting-children` in the discovery scan** — adopted: a parent with pending children is a flow root in that state; scanning only active/waiting would hide exactly the flows the view exists to show.
- **Only show flow roots (jobs that have children)** — rejected: the ticket's demo is "see the whole pipeline at once"; dropping plain live jobs would hide most of a queue's work.
- **Cap the walk itself instead of the response** — rejected: bullmq's `getFlow` walk (depth, `maxChildren` per type per node) is the per-root bound; the 200-node budget is enforced in the simplifier, where omitted children flip `truncated`.
- **Per-job tree with the same caps** — rejected: the mirror contract (ADR-0001) keeps bull-board's per-job `/flow` behavior; caps are the queue-level view's job.

**Consequences**

- The route table gains `GET /api/queues/:queueName/flow` before `/:jobId` (the literal `flow` segment must win over being read as a job id) and `GET /api/queues/:queueName/:jobId/flow` before `/:jobId`, mirroring bull-board's ordering.
- Bull queues answer an empty graph and an `isFlowNode: false` per-job flow (Bull has no flows); both endpoints 404 on unknown queues, and the per-job route 404s on unknown jobs, consistent with ADR-0003's tightening.
- Nodes carry the raw BullMQ `queueName` — flows span queues, so a child can live in a queue the graph was not opened for; the UI labels those nodes with their queue and routes clicks to that queue's job detail when it is registered.
- `BaseAdapter` gains a `getFlowProducer()` default of `null` so the flow provider stays adapter-agnostic; `BullMQAdapter` overrides it with the v6 backend path (`new FlowProducer(queue.opts, () => backend)`) and the v5 client path.
- Discovery windows are per-state (BullMQ pages each state's list by the same `start`/`end`), so a scan examines at most 3 × 200 candidates regardless of queue size.

---
'@bullmq-dash/api': minor
'@bullmq-dash/ui': minor
---

Flow view: `GET /api/queues/:queueName/flow` assembles the queue-level flow graph - root jobs discovered across the active, waiting, and waiting-children states, each expanded into its child tree via `FlowProducer.getFlow` (depth capped at 5, the response capped at 200 nodes with a `truncated` notice), and `GET /api/queues/:queueName/:jobId/flow` serves a job's flow tree from its root (mirroring bull-board's `{ nodeId, isFlowNode, flowRoot }` shape, walking the parent chain across queues). The UI renders the graph with @xyflow/react + @dagrejs/dagre: dagre auto-layout, state-colored nodes, and click-to-detail navigation; a Flow button on the queue's jobs view opens the whole-pipeline graph, and the job detail view shows the job's flow tree when it is part of a flow.

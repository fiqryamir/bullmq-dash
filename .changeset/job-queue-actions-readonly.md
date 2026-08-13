---
'@bullmq-dash/api': minor
'@bullmq-dash/ui': minor
---

Job + queue actions, all gated by `readOnly`. `createBullBoard` accepts `options.readOnly` — when set, every mutating REST route answers 403 and the queues response marks each queue read-only so the UI hides the controls. Mutation endpoints mirror bull-board's shapes (`PUT /api/queues/:queueName/retry/:queueStatus` → `{ retried, skipped }`, `.../promote`, `.../clean/:queueStatus` with a `grace` in seconds, `.../pause`, `.../resume`, `.../empty`, and per-job `PUT /api/queues/:queueName/:jobId/retry|promote` → 204), plus two additions beyond bull-board: job remove (`.../:jobId/remove`) and bulk remove by state (`.../remove/:queueStatus` → `{ removed }`). The UI wires every action: per-row Retry/Promote/Remove, per-tab Retry all/Promote all/Clean/Remove all (with confirmation for destructive ones), and Pause/Resume/Empty in the queue header — all hidden in read-only mode.

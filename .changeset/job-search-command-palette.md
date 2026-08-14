---
'@bullmq-dash/api': minor
'@bullmq-dash/ui': minor
---

Job search: `GET /api/search` searches jobs by id or name across every visible queue, and `GET /api/queues/:queueName/search` scopes the search to one queue — case-insensitive substring matches, narrowed by a comma-separated `status` list, results capped at 500 with a `start` deepen-search continuation (`totalScanned`/`deepen` in the response). The UI adds a 300ms-debounced command palette with state filter chips, a virtualized result list, and a deepen button that continues past the cap: cross-queue on the home view, scoped to the queue inside a queue's jobs view. Clicking a result opens the job's detail from any queue.

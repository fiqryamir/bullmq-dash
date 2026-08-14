# Job search scans per-state sets in bounded windows, with a `start` continuation past the 500-result cap

Job search in bullmq-dash v1 (issue #24) is a core-owned read-only search over job id + name. BullMQ v6 offers no native search — `getJobs` only pages through per-state sets, and bull-board's maintainers refuse to touch Redis internals (research in `docs/research/bullmq-v6-api-surface.md`). So the search walks the state sets through the queue adapter's existing `getJobs(statuses, start, end)` seam: `GET /api/search?term=&status=&start=` searches every visible queue in registration order; `GET /api/queues/:queueName/search` scopes the same scan to one queue. Matches are case-insensitive substrings of `job.id` or `job.name`. The response is `{ term, count, totalScanned, deepen, results: [{ queue, job, state }] }`.

**Scanning contract.** Each queue is scanned as one concatenated sequence of its states (in the adapter's `getJobStatuses()` order), chunked 100 jobs per `getJobs` call. One request scans at most 5,000 jobs (`SEARCH_SCAN_LIMIT`) and returns at most 500 matches (`SEARCH_RESULT_LIMIT`); the scan stops at whichever comes first. `totalScanned` counts distinct jobs examined by that request, and `deepen: true` means the scan stopped before searching everything — either limit hit. The caller deepens by re-requesting with `start` = the accumulated `totalScanned` of all prior calls, which skips that many jobs of the sequence. A paused queue's `paused` view is its waiting jobs, exactly as on the jobs list.

**Considered Options**

- **Scan state sets through the adapter seam** — adopted: no new adapter methods; works for any adapter whose `getJobs` pages by range; the scan stays bounded per request.
- **Read Redis internals directly** — rejected: breaks the drop-in adapter pattern and the no-Redis-poking position the research documents.
- **Uncapped scan until exhausted or 500 matches** — rejected: one request on a multi-million-job queue would hang the palette; the 5,000-job scan window bounds request time and makes `deepen` meaningful even when nothing matches.
- **Cursor continuation with per-state offsets** — rejected: jobs churn under a live scan anyway, so a single scanned-job offset is no less accurate and far simpler.
- **Ordered results (e.g. newest first)** — rejected: the search scans in the backing library's order per state; the contract promises matches, not a sort.

**Consequences**

- The route table registers `/api/search` and `/api/queues/:queueName/search` before the `:jobId` routes so the literal `search` segment wins, like `jobs` (ADR-0003).
- Search is read-only: visibility guards apply (hidden queues never scanned), `readOnly` does not gate it.
- On BullMQ v6 a paused queue's `paused` view is its waiting jobs, so when both `waiting` and `paused` are in scope the scan collapses to `waiting` — the same collapse the jobs list performs per-state (ADR-0005 scan contract), applied to the scan set so no job is scanned or reported twice.
- A continuation call re-scans from the offset, so jobs added after the first call can be re-seen; the offset can also skip past jobs removed mid-search. That drift is accepted for a search UX.
- The UI palette debounces 300ms, filters by state chips, virtualizes the result list, and fetches the continuation with `start` when `deepen` is true.

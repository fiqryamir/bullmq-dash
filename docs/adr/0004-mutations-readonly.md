# Mutation endpoints mirror bull-board's shapes, with remove as an explicit addition, and the board-level `readOnly` option gates every mutation

Job + queue actions in bullmq-dash v1 (issue #23) ship as REST mutations mirroring bull-board v8's route table and response shapes: `PUT /api/queues/:queueName/retry/:queueStatus` → `{ retried, skipped }`, `.../promote`, `.../clean/:queueStatus` (grace in **seconds**, defaulting to 5), `.../pause`, `.../resume`, `.../empty`, and per-job `PUT /api/queues/:queueName/:jobId/retry|promote` → 204 with a 400 for non-retriable states. Where bull-board only offers remove through the per-job `clean` route (which wraps `job.remove()`), bullmq-dash keeps that route as an alias for route-table parity and adds an explicit `.../:jobId/remove` (409 while active) plus bulk remove by state (`.../remove/:queueStatus` → `{ removed }`). `readOnly` on `createBullBoard` (BoardOptions) disables every mutation end to end: handlers answer 403 and the queues response marks each queue read-only, so the UI hides the controls; per-queue `readOnlyMode` (bull-board's existing knob) gates the same way. The board-level flag is core-owned — it rides the uiConfig to handlers (`uiConfig.readOnly`), with `options.readOnly` winning when both are given and the `uiConfig.readOnly` spelling honored when the option is absent.

**Considered Options**

- **Mirror bull-board's shapes, add explicit remove routes** — adopted: the drop-in migration story (ADR-0001) extends to the UI contract, `remove` is surfaced honestly as its own action, and the `:jobId/clean` route stays as an alias so the route table mirrors bull-board's exactly.
- **Bulk remove by explicit job-id list** — rejected: state-scoped bulk remove (`remove/:queueStatus`) mirrors the sibling `retry/:queueStatus` and `clean/:queueStatus` routes, keeps the handler stateless, and wires directly to the UI's per-tab "Remove all" controls.
- **Per-adapter readOnly enforcement** — rejected: the REST contract is the seam where mutations are gated; the adapter methods stay faithful to their backing library so embedded hosts can keep full control.
- **`empty` removing delayed jobs too** — rejected: bull-board's `empty` maps to BullMQ's `drain()` (waiting only); delayed jobs survive, matching the mirror.
- **Bulk actions failing wholesale on a raced job** — rejected: bulk retry and bulk remove count only the jobs that settled successfully (`Promise.allSettled`), so a job a worker picked up mid-request lands in `skipped`/is not counted as `removed` instead of 500ing the whole batch.

**Consequences**

- The UI contract (routes, status codes, response bodies) is now the mutation surface; clients of the REST API get 403 for every mutation on a read-only board or queue.
- `clean` accepts the statuses BullMQ's `clean` supports (`completed`, `failed`, `delayed`, `waiting`, `active`, `prioritized`), derived from one constant so the type and validator cannot drift; `paused` and `waiting-children` are not clean types here.
- Bulk retry counts `{ retried, skipped }` the way bull-board does — counted first, fetched after, so a job finishing mid-request understates the gap rather than inventing one.
- `retry/:queueStatus` is registered before the per-job `:jobId/retry` route so a literal `retry` job id segment resolves to the bulk handler, exactly as in bull-board.

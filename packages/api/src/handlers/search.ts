import { isJobStatus } from '../constants/statuses';
import type { BaseAdapter } from '../queueAdapters/base';
import type {
  BullBoardRequest,
  ControllerHandlerReturnType,
  JobStatus,
  QueueJob,
  SearchResponse,
  SearchResult,
} from '../typings/app';
import { paramValue, resolveQueue } from './helpers';
import { formatJob } from './queues';
import { stringValue } from './query';

/**
 * The most matches one search request returns. Searches that would match more
 * stop here and report `deepen: true`, so the caller can continue from the
 * scanned offset.
 */
export const SEARCH_RESULT_LIMIT = 500;

/**
 * The most jobs one search request examines. The window keeps a request
 * bounded in time on queues with millions of jobs; hitting it also reports
 * `deepen: true` so the caller can keep scanning.
 */
export const SEARCH_SCAN_LIMIT = 5000;

/** Jobs fetched per state per chunk while scanning. */
const SEARCH_CHUNK_SIZE = 100;

type QueueScan = {
  results: SearchResult[];
  scanned: number;
  skipped: number;
  /** The scan of this queue was cut short — more matches may remain in it. */
  deepen: boolean;
};

function matchesTerm(job: QueueJob, term: string): boolean {
  const lowered = term.toLowerCase();
  return (
    (job.id ?? '').toLowerCase().includes(lowered) ||
    (job.name ?? '').toLowerCase().includes(lowered)
  );
}

/**
 * Walks the queue's states in order, chunking `getJobs` per state, and collects
 * the jobs whose id or name matches `term` until the remaining scan window or
 * result cap is exhausted. `start` skips the first jobs of the queue's
 * concatenated state sequence — the continuation cursor from an earlier call.
 */
async function scanQueue(
  queue: BaseAdapter,
  queueName: string,
  statuses: JobStatus[],
  term: string,
  start: number,
  scanLimit: number,
  resultLimit: number
): Promise<QueueScan> {
  const results: SearchResult[] = [];
  let scanned = 0;
  let skipped = 0;
  let deepen = false;

  for (const status of statuses) {
    let chunkStart = 0;
    let chunk: QueueJob[];

    do {
      chunk = await queue.getJobs([status], chunkStart, chunkStart + SEARCH_CHUNK_SIZE - 1);

      for (const job of chunk) {
        if (skipped < start) {
          skipped += 1;
          continue;
        }
        if (scanned >= scanLimit) {
          deepen = true;
          break;
        }
        scanned += 1;
        if (matchesTerm(job, term)) {
          results.push({ queue: queueName, job: formatJob(job, queue), state: status });
          if (results.length >= resultLimit) {
            deepen = true;
            break;
          }
        }
      }

      chunkStart += SEARCH_CHUNK_SIZE;
    } while (chunk.length === SEARCH_CHUNK_SIZE && scanned < scanLimit && results.length < resultLimit);
  }

  return { results, scanned, skipped, deepen };
}

function parseStatuses(query: Record<string, unknown>): JobStatus[] | null {
  const raw = stringValue(query, 'status');
  if (raw === undefined || raw.trim() === '') {
    return [];
  }

  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.some((part) => !isJobStatus(part))) {
    return null;
  }
  return parts as JobStatus[];
}

function parseStart(query: Record<string, unknown>): number {
  const start = Number(stringValue(query, 'start'));
  return Number.isFinite(start) ? Math.max(0, Math.floor(start)) : 0;
}

/**
 * Searches jobs by id or name across every visible queue (no `queueName`
 * param) or within a single registered queue. `term` is required; `status`
 * narrows to a comma-separated state list; `start` continues a deepened
 * search from an earlier response's scanned offset.
 */
export async function searchHandler(req: BullBoardRequest): Promise<ControllerHandlerReturnType> {
  const term = stringValue(req.query, 'term')?.trim() ?? '';
  if (!term) {
    return { status: 400, body: { error: 'Missing search term' } };
  }

  const statuses = parseStatuses(req.query);
  if (!statuses) {
    return { status: 400, body: { error: 'Invalid status' } };
  }

  const start = parseStart(req.query);

  const queueName = paramValue(req, 'queueName');
  const pairs: [string, BaseAdapter][] = [];

  if (queueName) {
    const queue = await resolveQueue(req);
    if (!queue) {
      return { status: 404, body: { error: 'Queue not found' } };
    }
    pairs.push([queueName, queue]);
  } else {
    for (const [name, queue] of req.queues.entries()) {
      if (await queue.isVisible(req)) {
        pairs.push([name, queue]);
      }
    }
  }

  const results: SearchResult[] = [];
  let totalScanned = 0;
  let startRemaining = start;
  let deepen = false;

  for (const [name, queue] of pairs) {
    const scopeStatuses =
      statuses.length > 0
        ? statuses.filter((status) => queue.getJobStatuses().includes(status))
        : queue.getJobStatuses();

    if (scopeStatuses.length === 0) {
      continue;
    }

    const scan = await scanQueue(
      queue,
      name,
      scopeStatuses,
      term,
      startRemaining,
      SEARCH_SCAN_LIMIT - totalScanned,
      SEARCH_RESULT_LIMIT - results.length
    );

    results.push(...scan.results);
    totalScanned += scan.scanned;
    startRemaining -= scan.skipped;

    if (scan.deepen || totalScanned >= SEARCH_SCAN_LIMIT || results.length >= SEARCH_RESULT_LIMIT) {
      deepen = true;
      break;
    }
  }

  return {
    body: { term, count: results.length, totalScanned, deepen, results } satisfies SearchResponse,
  };
}

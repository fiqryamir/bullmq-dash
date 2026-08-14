import type { Queue } from 'bullmq';

/**
 * Fills a queue with `count` jobs whose ids share `prefix` (`prefix-0` …
 * `prefix-<count - 1>`), batched through `addBulk`. The search specs use it
 * to build queues larger than the search result cap and the scan window.
 */
export async function seedQueueJobs(queue: Queue, prefix: string, count: number): Promise<void> {
  await queue.addBulk(
    Array.from({ length: count }, (_, index) => ({
      name: `${prefix}-job`,
      data: { index },
      opts: { jobId: `${prefix}-${index}` },
    }))
  );
}

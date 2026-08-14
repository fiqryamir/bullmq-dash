import type { FlowProducer, Job, JobNode } from 'bullmq';
import { STATUSES } from '../constants/statuses';
import type { BaseAdapter } from '../queueAdapters/base';
import type { BullBoardQueues, FlowNode, JobStatus, QueueJob } from '../typings/app';

/**
 * How many levels of a flow tree one `getFlow` walk visits. The queue-level
 * graph passes this explicitly so the pipeline stays readable; the per-job
 * tree lets BullMQ keep its own default (deeper).
 */
export const FLOW_MAX_DEPTH = 5;

/**
 * The most nodes the queue-level flow graph carries across all roots, and the
 * window of candidates the root discovery scan examines per state. A pipeline
 * bigger than this is answered with a truncated notice.
 */
export const FLOW_MAX_NODES = 200;

/**
 * The states whose jobs can be flow roots in the queue-level graph: a root is
 * either waiting for its children (`waiting-children`), waiting, or being
 * processed. Children always carry `opts.parent`, so a root is a live job
 * without one.
 */
const FLOW_ROOT_STATUSES = [STATUSES.active, STATUSES.waiting, STATUSES.waitingChildren] as const;

function findBullMQAdapter(queues: BullBoardQueues): BaseAdapter | null {
  for (const adapter of queues.values()) {
    if (adapter.type === 'bullmq') {
      return adapter;
    }
  }
  return null;
}

/**
 * A lookup from registered queue name to adapter, rebuilt per call to stay
 * consistent with dynamic queue changes. The registered name includes the
 * adapter's prefix, so raw BullMQ names are matched with `simplifyQueueName`
 * before hitting the lookup.
 */
function buildQueueNameLookup(queues: BullBoardQueues): Map<string, BaseAdapter> {
  const lookup = new Map<string, BaseAdapter>();
  for (const adapter of queues.values()) {
    if (adapter.type === 'bullmq') {
      lookup.set(adapter.getName(), adapter);
    }
  }
  return lookup;
}

/**
 * Maps a raw BullMQ queue name onto a registered one. BullMQ stores names
 * without the queue's prefix; the board registers them prefixed, so the raw
 * name either equals the registered name or is that name with something in
 * front of it.
 */
function simplifyQueueName(queueName: string, lookup: Map<string, BaseAdapter>): string {
  const simpleQueueName = Array.from(lookup.keys()).find(
    (key) => queueName === key || queueName.endsWith(`:${key}`)
  );
  return simpleQueueName || queueName;
}

/**
 * The producer for the flow root's queue, so on a board mixing backends or
 * connections the tree is read from the datastore it lives in. The first
 * bullmq adapter is only a fallback for a root whose queue is not registered
 * on the board.
 */
async function resolveFlowProducer(
  queues: BullBoardQueues,
  queueName: string
): Promise<FlowProducer | null> {
  const adapter = buildQueueNameLookup(queues).get(queueName) ?? findBullMQAdapter(queues);
  return adapter ? adapter.getFlowProducer() : null;
}

/**
 * Walks the parent chain of a job across queues to find the flow root —
 * the job that has no parent of its own. Returns the raw BullMQ queue name
 * and job id of the root, or `null` when the chain cannot be followed (a
 * parent queue not registered on the board, or a missing parent job).
 */
export async function findFlowRoot(
  queues: BullBoardQueues,
  job: Job
): Promise<{ queueName: string; jobId: string } | null> {
  const lookup = buildQueueNameLookup(queues);
  let currJob: Job | null = job;

  while (currJob) {
    const currQueueName = simplifyQueueName(currJob.queueName, lookup);
    const parent = currJob.opts?.parent;

    if (!parent?.id || !parent?.queue) {
      return currJob.id ? { queueName: currQueueName, jobId: currJob.id } : null;
    }

    const simpleParentQueueName = simplifyQueueName(parent.queue, lookup);
    const parentAdapter = simpleParentQueueName ? lookup.get(simpleParentQueueName) : null;
    if (!parentAdapter) {
      return null;
    }

    const parentJob = await parentAdapter.getJob(parent.id);
    if (!parentJob) {
      return null;
    }

    currJob = parentJob;
  }

  return null;
}

/**
 * The flow tree of one job, or `null` when the queue has no flow producer or
 * BullMQ cannot assemble the tree.
 */
export async function getFlowTree(
  queues: BullBoardQueues,
  queueName: string,
  jobId: string,
  depth?: number
): Promise<JobNode | null> {
  const producer = await resolveFlowProducer(queues, queueName);
  if (!producer) {
    return null;
  }

  return producer.getFlow({ queueName, id: jobId, ...(depth !== undefined ? { depth } : {}) })
    .catch(() => null);
}

/**
 * How many nodes may still be added to the response, shared across roots and
 * set to `truncated` the moment a node is omitted because the budget ran out.
 */
type NodeBudget = { remaining: number; truncated: boolean };

/**
 * Reduces a BullMQ `JobNode` tree to the wire shape. Each node spends one unit
 * of `budget.remaining`; when the budget runs out, the children that cannot be
 * shown are omitted and the budget is marked truncated.
 */
export async function simplifyNode(
  node: JobNode | null | undefined,
  budget: NodeBudget
): Promise<FlowNode | null> {
  if (!node?.job.id) {
    return null;
  }

  budget.remaining -= 1;

  const children: FlowNode[] = [];
  if (node.children) {
    if (budget.remaining <= 0) {
      budget.truncated = true;
    } else {
      for (const child of node.children) {
        if (budget.remaining <= 0) {
          budget.truncated = true;
          break;
        }
        const simplified = await simplifyNode(child, budget);
        if (simplified) {
          children.push(simplified);
        }
      }
    }
  }

  const state = (await node.job.getState()) as JobStatus | 'unknown';

  return {
    id: node.job.id,
    name: node.job.name,
    progress: node.job.progress,
    state,
    queueName: node.job.queueName,
    children,
  };
}

/**
 * The candidates the queue-level graph may assemble from: the live jobs in
 * each root state, windowed per state so the scan stays bounded. Jobs that
 * carry a parent are children and their root covers them, so only parentless
 * jobs come back as roots. `truncated` is set when a state window was full —
 * more candidates may exist beyond it.
 */
export async function discoverFlowRoots(
  queues: BullBoardQueues,
  queue: BaseAdapter
): Promise<{ roots: QueueJob[]; truncated: boolean }> {
  const windows = await Promise.all(
    [...FLOW_ROOT_STATUSES].map((status) => queue.getJobs([status], 0, FLOW_MAX_NODES - 1))
  );

  return {
    roots: windows.flat().filter((job) => !job.opts?.parent?.id),
    truncated: windows.some((window) => window.length >= FLOW_MAX_NODES),
  };
}

/**
 * Assembles the queue-level flow graph: every discovered root expanded into
 * its tree, capped at `FLOW_MAX_NODES` nodes across all roots and
 * `FLOW_MAX_DEPTH` levels per root. `truncated` reports either cap being hit.
 */
export async function assembleQueueFlow(
  queues: BullBoardQueues,
  queue: BaseAdapter
): Promise<{ roots: FlowNode[]; nodeCount: number; truncated: boolean }> {
  const { roots, truncated: scanTruncated } = await discoverFlowRoots(queues, queue);
  const budget: NodeBudget = { remaining: FLOW_MAX_NODES, truncated: false };
  const simplifiedRoots: FlowNode[] = [];

  for (const root of roots) {
    if (budget.remaining <= 0) {
      budget.truncated = true;
      break;
    }
    const tree = await getFlowTree(queues, root.queueName, root.id ?? '', FLOW_MAX_DEPTH);
    const simplified = await simplifyNode(tree, budget);
    if (simplified) {
      simplifiedRoots.push(simplified);
    }
  }

  return {
    roots: simplifiedRoots,
    nodeCount: FLOW_MAX_NODES - budget.remaining,
    truncated: scanTruncated || budget.truncated,
  };
}

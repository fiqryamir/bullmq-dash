import type {
  BullBoardRequest,
  ControllerHandlerReturnType,
  JobFlow,
  QueueFlowResponse,
} from '../typings/app';
import { assembleQueueFlow, findFlowRoot, getFlowTree, simplifyNode } from '../providers/flow';
import { paramValue, resolveQueue } from './helpers';

function emptyJobFlow(nodeId: string) {
  return { nodeId, isFlowNode: false, flowRoot: null } satisfies JobFlow;
}

/**
 * The queue-level flow graph: the queue's live roots expanded into their
 * child trees, capped with a truncated notice. Bull queues have no flows and
 * answer an empty graph.
 */
export async function queueFlowHandler(req: BullBoardRequest): Promise<ControllerHandlerReturnType> {
  const queue = await resolveQueue(req);

  if (!queue) {
    return { status: 404, body: { error: 'Queue not found' } };
  }

  if (queue.type !== 'bullmq') {
    return { body: { roots: [], nodeCount: 0, truncated: false } satisfies QueueFlowResponse };
  }

  return { body: (await assembleQueueFlow(req.queues, queue)) satisfies QueueFlowResponse };
}

/**
 * The per-job flow tree: the requested job's flow root expanded into its
 * whole tree, mirroring bull-board's `/flow` route. A job outside a flow
 * answers `isFlowNode: false` with no root.
 */
export async function jobFlowHandler(req: BullBoardRequest): Promise<ControllerHandlerReturnType> {
  const queue = await resolveQueue(req);

  if (!queue) {
    return { status: 404, body: { error: 'Queue not found' } };
  }

  const job = await queue.getJob(paramValue(req, 'jobId'));

  if (!job) {
    return { status: 404, body: { error: 'Job not found' } };
  }

  const nodeId = job.id ?? '';

  if (queue.type !== 'bullmq') {
    return { body: emptyJobFlow(nodeId) satisfies JobFlow };
  }

  const root = await findFlowRoot(req.queues, job);

  if (!root) {
    return { body: emptyJobFlow(nodeId) satisfies JobFlow };
  }

  const flowTree = await getFlowTree(req.queues, root.queueName, root.jobId);
  const flowRoot = await simplifyNode(flowTree, { remaining: Number.MAX_SAFE_INTEGER, truncated: false });

  return {
    body: {
      nodeId,
      isFlowNode: (flowRoot?.children.length ?? 0) > 0,
      flowRoot,
    } satisfies JobFlow,
  };
}

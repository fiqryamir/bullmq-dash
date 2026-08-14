import { randomUUID } from 'node:crypto';
import { FlowProducer, Queue, Worker } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FLOW_MAX_NODES } from '../providers/flow';
import { BullMQAdapter } from '../queueAdapters/bullMQ';
import { TestQueueAdapter } from '../testUtils/TestQueueAdapter';
import { pollUntil } from '../testUtils/pollUntil';
import type {
  BullBoardQueues,
  BullBoardRequest,
  FlowNode,
  QueueFlowResponse,
  QueueJob,
} from '../typings/app';
import { jobFlowHandler, queueFlowHandler } from './flow';

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
};

function collectIds(node: FlowNode): string[] {
  return [node.id, ...node.children.flatMap(collectIds)];
}

describe('queueFlowHandler', () => {
  const queueName = `bullmq-dash-test-flow-${randomUUID()}`;
  const siblingQueueName = `bullmq-dash-test-flow-sibling-${randomUUID()}`;
  let queue: Queue;
  let siblingQueue: Queue;
  let flowProducer: FlowProducer;
  let request: BullBoardRequest;
  let plainJobId: string;
  let flowRootId: string;
  let childJobId: string;
  let deepRootId: string;
  let deepLeafId: string;
  let crossQueueRootId: string;
  let crossQueueChildId: string;

  beforeAll(async () => {
    queue = new Queue(queueName, { connection });
    siblingQueue = new Queue(siblingQueueName, { connection });
    flowProducer = new FlowProducer({ connection });

    const plainJob = await queue.add('plain-job', { payload: 1 });
    plainJobId = plainJob.id!;

    const flow = await flowProducer.add({
      name: 'flow-root',
      queueName,
      data: { kind: 'root' },
      children: [
        { name: 'child-1', queueName, data: { kind: 'child' } },
        { name: 'child-2', queueName, data: { kind: 'child' } },
      ],
    });
    flowRootId = flow.job.id!;
    childJobId = flow.children![0]!.job.id!;

    const deep = await flowProducer.add({
      name: 'deep-root',
      queueName,
      children: [
        {
          name: 'deep-1',
          queueName,
          children: [
            {
              name: 'deep-2',
              queueName,
              children: [
                {
                  name: 'deep-3',
                  queueName,
                  children: [
                    {
                      name: 'deep-4',
                      queueName,
                      children: [{ name: 'deep-5', queueName }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    deepRootId = deep.job.id!;
    deepLeafId = deep.children![0]!.children![0]!.children![0]!.children![0]!.children![0]!.job.id!;

    const crossQueue = await flowProducer.add({
      name: 'cross-root',
      queueName,
      children: [{ name: 'cross-child', queueName: siblingQueueName }],
    });
    crossQueueRootId = crossQueue.job.id!;
    crossQueueChildId = crossQueue.children![0]!.job.id!;

    const queues: BullBoardQueues = new Map();
    queues.set(queueName, new BullMQAdapter(queue));
    queues.set(siblingQueueName, new BullMQAdapter(siblingQueue));

    request = {
      queues,
      uiConfig: {},
      query: {},
      params: { queueName },
      body: {},
      headers: {},
    };
  }, 30_000);

  afterAll(async () => {
    await flowProducer.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await siblingQueue.obliterate({ force: true });
    await siblingQueue.close();
  }, 30_000);

  const send = async (): Promise<{ status?: number | undefined; body: QueueFlowResponse }> => {
    const response = await queueFlowHandler({ ...request, params: { queueName } });
    return {
      status: response.status,
      body: response.body as unknown as QueueFlowResponse,
    };
  };

  it('answers an empty graph for an empty queue', async () => {
    const emptyQueue = new Queue(`bullmq-dash-test-flow-empty-${randomUUID()}`, { connection });
    const queues: BullBoardQueues = new Map();
    queues.set(emptyQueue.name, new BullMQAdapter(emptyQueue));

    try {
      const response = await queueFlowHandler({ ...request, queues, params: { queueName: emptyQueue.name } });
      expect(response.status).toBeUndefined();
      expect(response.body).toEqual({ roots: [], nodeCount: 0, truncated: false });
    } finally {
      await emptyQueue.obliterate({ force: true });
      await emptyQueue.close();
    }
  }, 30_000);

  it('reports an unregistered queue as not found', async () => {
    const response = await queueFlowHandler({ ...request, params: { queueName: 'not-a-queue' } });
    expect(response.status).toBe(404);
  });

  it('hides queues behind a visibility guard', async () => {
    const hidden = new BullMQAdapter(queue);
    hidden.setVisibilityGuard(() => false);
    request.queues.set(queueName, hidden);

    const response = await queueFlowHandler({ ...request, params: { queueName } });
    expect(response.status).toBe(404);

    request.queues.set(queueName, new BullMQAdapter(queue));
  });

  it('discovers live jobs across active, waiting and waiting-children states', async () => {
    const { body } = await send();

    const rootIds = body.roots.map((root) => root.id);
    expect(rootIds).toEqual(
      expect.arrayContaining([plainJobId, flowRootId, deepRootId, crossQueueRootId])
    );
    expect(rootIds).not.toContain(childJobId);
  });

  it('expands a flow root into its child tree', async () => {
    const { body } = await send();

    const root = body.roots.find((node) => node.id === flowRootId);
    expect(root).toBeDefined();
    expect(root!.name).toBe('flow-root');
    expect(root!.queueName).toBe(queueName);
    expect(root!.state).toBe('waiting-children');
    expect(root!.children.map((child) => child.id)).toEqual(
      expect.arrayContaining([childJobId])
    );
  });

  it('shows a plain job as a single-node root', async () => {
    const { body } = await send();

    const root = body.roots.find((node) => node.id === plainJobId);
    expect(root).toMatchObject({ id: plainJobId, name: 'plain-job', queueName, children: [] });
  });

  it('keeps the tree to the flow depth cap', async () => {
    const { body } = await send();

    const root = body.roots.find((node) => node.id === deepRootId);
    expect(root).toBeDefined();
    const ids = root ? collectIds(root) : [];
    expect(ids).toContain(deepRootId);
    expect(ids).not.toContain(deepLeafId);
  });

  it('includes cross-queue children with their own queue name', async () => {
    const { body } = await send();

    const root = body.roots.find((node) => node.id === crossQueueRootId);
    const child = root?.children.find((node) => node.id === crossQueueChildId);
    expect(child).toBeDefined();
    expect(child!.queueName).toBe(siblingQueueName);
    expect(root!.queueName).toBe(queueName);
  });

  it('counts every node across the roots', async () => {
    const { body } = await send();
    expect(body.nodeCount).toBe(body.roots.reduce((total, root) => total + collectIds(root).length, 0));
    expect(body.truncated).toBe(false);
  });
});

describe('queueFlowHandler node cap', () => {
  const queueName = `bullmq-dash-test-flow-cap-${randomUUID()}`;
  let queue: Queue;
  let flowProducer: FlowProducer;
  let request: BullBoardRequest;

  beforeAll(async () => {
    queue = new Queue(queueName, { connection });
    flowProducer = new FlowProducer({ connection });

    await flowProducer.add({
      name: 'cap-root',
      queueName,
      children: Array.from({ length: 20 }, (_, index) => ({
        name: `cap-child-${index}`,
        queueName,
        children: Array.from({ length: 10 }, (_, childIndex) => ({
          name: `cap-grand-${index}-${childIndex}`,
          queueName,
        })),
      })),
    });

    const queues: BullBoardQueues = new Map();
    queues.set(queueName, new BullMQAdapter(queue));

    request = {
      queues,
      uiConfig: {},
      query: {},
      params: { queueName },
      body: {},
      headers: {},
    };
  }, 30_000);

  afterAll(async () => {
    await flowProducer.close();
    await queue.obliterate({ force: true });
    await queue.close();
  }, 30_000);

  it('caps the graph at the node budget with a truncated notice', async () => {
    const response = await queueFlowHandler({ ...request, params: { queueName } });
    const body = response.body as unknown as QueueFlowResponse;

    expect(body.nodeCount).toBe(FLOW_MAX_NODES);
    expect(body.truncated).toBe(true);
  });
});

describe('queueFlowHandler scan window', () => {
  const queueName = `bullmq-dash-test-flow-scan-${randomUUID()}`;
  let queue: Queue;
  let request: BullBoardRequest;

  beforeAll(async () => {
    queue = new Queue(queueName, { connection });

    await queue.addBulk(
      Array.from({ length: FLOW_MAX_NODES + 10 }, (_, index) => ({
        name: `bulk-${index}`,
        data: { index },
      }))
    );

    const queues: BullBoardQueues = new Map();
    queues.set(queueName, new BullMQAdapter(queue));

    request = {
      queues,
      uiConfig: {},
      query: {},
      params: { queueName },
      body: {},
      headers: {},
    };
  }, 30_000);

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
  }, 30_000);

  it('reports truncation when a state window is full', async () => {
    const response = await queueFlowHandler({ ...request, params: { queueName } });
    const body = response.body as unknown as QueueFlowResponse;

    expect(body.roots).toHaveLength(FLOW_MAX_NODES);
    expect(body.nodeCount).toBe(FLOW_MAX_NODES);
    expect(body.truncated).toBe(true);
  });
});

describe('queueFlowHandler active roots', () => {
  const queueName = `bullmq-dash-test-flow-active-${randomUUID()}`;
  let queue: Queue;
  let worker: Worker | undefined;
  let request: BullBoardRequest;
  let activeJobId: string;

  beforeAll(async () => {
    queue = new Queue(queueName, { connection });

    worker = new Worker(
      queueName,
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 4_000));
      },
      { connection }
    );

    const activeJob = await queue.add('active-root', {});
    activeJobId = activeJob.id!;
    await pollUntil(async () => (await activeJob.getState()) === 'active', 10_000);

    const queues: BullBoardQueues = new Map();
    queues.set(queueName, new BullMQAdapter(queue));

    request = {
      queues,
      uiConfig: {},
      query: {},
      params: { queueName },
      body: {},
      headers: {},
    };
  }, 30_000);

  afterAll(async () => {
    await worker?.close();
    await queue.obliterate({ force: true });
    await queue.close();
  }, 30_000);

  it('discovers a job in the active state as a root', async () => {
    const response = await queueFlowHandler({ ...request, params: { queueName } });
    const body = response.body as unknown as QueueFlowResponse;

    expect(body.roots.map((root) => root.id)).toContain(activeJobId);
  }, 15_000);
});

describe('flow handlers on a Bull queue', () => {
  const buildRequest = (queueName: string, queues: BullBoardQueues): BullBoardRequest => ({
    queues,
    uiConfig: {},
    query: {},
    params: { queueName },
    body: {},
    headers: {},
  });

  it('answers an empty graph without a 404', async () => {
    const queue = new TestQueueAdapter('bull-queue', {}, 'bull');
    const response = await queueFlowHandler(buildRequest('bull-queue', new Map([['bull-queue', queue]])));
    expect(response.status).toBeUndefined();
    expect(response.body).toEqual({ roots: [], nodeCount: 0, truncated: false });
  });

  it('answers an empty per-job flow for a bull job', async () => {
    const queue = new TestQueueAdapter('bull-queue', {}, 'bull');
    queue.getJob = async () =>
      ({ id: '7', name: 'bull-job', opts: {} }) as unknown as QueueJob;

    const response = await jobFlowHandler(
      buildRequest('bull-queue', new Map([['bull-queue', queue]]))
    );
    expect(response.status).toBeUndefined();
    expect(response.body).toEqual({ nodeId: '7', isFlowNode: false, flowRoot: null });
  });
});

describe('jobFlowHandler', () => {
  const queueName = `bullmq-dash-test-flow-job-${randomUUID()}`;
  const siblingQueueName = `bullmq-dash-test-flow-job-sibling-${randomUUID()}`;
  let queue: Queue;
  let siblingQueue: Queue;
  let flowProducer: FlowProducer;
  let request: BullBoardRequest;
  let plainJobId: string;
  let flowRootId: string;
  let childJobId: string;
  let crossQueueChildId: string;

  beforeAll(async () => {
    queue = new Queue(queueName, { connection });
    siblingQueue = new Queue(siblingQueueName, { connection });
    flowProducer = new FlowProducer({ connection });

    const plainJob = await queue.add('plain-job', { payload: 1 });
    plainJobId = plainJob.id!;

    const flow = await flowProducer.add({
      name: 'flow-root',
      queueName,
      children: [
        { name: 'child-1', queueName },
        { name: 'child-2', queueName },
      ],
    });
    flowRootId = flow.job.id!;
    childJobId = flow.children![0]!.job.id!;

    const crossQueue = await flowProducer.add({
      name: 'cross-root',
      queueName,
      children: [{ name: 'cross-child', queueName: siblingQueueName }],
    });
    crossQueueChildId = crossQueue.children![0]!.job.id!;

    const queues: BullBoardQueues = new Map();
    queues.set(queueName, new BullMQAdapter(queue));
    queues.set(siblingQueueName, new BullMQAdapter(siblingQueue));

    request = {
      queues,
      uiConfig: {},
      query: {},
      params: { queueName },
      body: {},
      headers: {},
    };
  }, 30_000);

  afterAll(async () => {
    await flowProducer.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await siblingQueue.obliterate({ force: true });
    await siblingQueue.close();
  }, 30_000);

  const send = async (
    params: Record<string, unknown> = { queueName, jobId: plainJobId }
  ): Promise<{ status?: number | undefined; body: Record<string, unknown> }> => {
    const response = await jobFlowHandler({ ...request, params });
    return { status: response.status, body: response.body as Record<string, unknown> };
  };

  it('reports an unregistered queue as not found', async () => {
    const { status } = await send({ queueName: 'not-a-queue', jobId: plainJobId });
    expect(status).toBe(404);
  });

  it('reports an unknown job as not found', async () => {
    const { status } = await send({ queueName, jobId: randomUUID() });
    expect(status).toBe(404);
  });

  it('reports a plain job as not part of a flow', async () => {
    const { status, body } = await send({ queueName, jobId: plainJobId });
    expect(status).toBeUndefined();
    const flow = body as unknown as { nodeId: string; isFlowNode: boolean; flowRoot: FlowNode };
    expect(flow.nodeId).toBe(plainJobId);
    expect(flow.isFlowNode).toBe(false);
    expect(flow.flowRoot).toMatchObject({ id: plainJobId, name: 'plain-job', children: [] });
  });

  it('serves the flow tree from the root job', async () => {
    const { body } = await send({ queueName, jobId: flowRootId });
    const flow = body as unknown as { nodeId: string; isFlowNode: boolean; flowRoot: FlowNode };

    expect(flow.nodeId).toBe(flowRootId);
    expect(flow.isFlowNode).toBe(true);
    expect(flow.flowRoot.id).toBe(flowRootId);
    expect(flow.flowRoot.children.map((child) => child.id)).toContain(childJobId);
  });

  it('walks up to the flow root from a child job', async () => {
    const { body } = await send({ queueName, jobId: childJobId });
    const flow = body as unknown as { nodeId: string; isFlowNode: boolean; flowRoot: FlowNode };

    expect(flow.nodeId).toBe(childJobId);
    expect(flow.isFlowNode).toBe(true);
    expect(flow.flowRoot.id).toBe(flowRootId);
  });

  it('follows the parent chain across queues', async () => {
    const { body } = await send({ queueName: siblingQueueName, jobId: crossQueueChildId });
    const flow = body as unknown as { nodeId: string; isFlowNode: boolean; flowRoot: FlowNode };

    expect(flow.nodeId).toBe(crossQueueChildId);
    expect(flow.isFlowNode).toBe(true);
    expect(flow.flowRoot.queueName).toBe(queueName);
    expect(flow.flowRoot.children.map((child) => child.id)).toContain(crossQueueChildId);
  });
});

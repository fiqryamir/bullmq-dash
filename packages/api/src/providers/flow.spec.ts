import type { Job, JobNode } from 'bullmq';
import { describe, expect, it } from 'vitest';
import { TestQueueAdapter } from '../testUtils/TestQueueAdapter';
import type { BullBoardQueues } from '../typings/app';
import { findFlowRoot, getFlowTree, simplifyNode } from './flow';

const queuesWith = (...adapters: TestQueueAdapter[]): BullBoardQueues => {
  const queues: BullBoardQueues = new Map();
  for (const adapter of adapters) {
    queues.set(adapter.getName(), adapter);
  }
  return queues;
};

const job = (overrides: Partial<Omit<Job, 'id'>> & { id?: string | undefined }): Job =>
  ({ id: '1', queueName: 'q', name: 'j', opts: {}, ...overrides }) as unknown as Job;

/** A test adapter serving an in-memory job registry for the parent-chain walk. */
class RegistryAdapter extends TestQueueAdapter {
  constructor(name: string, private jobs: Record<string, Job>) {
    super(name);
  }

  async getJob(jobId: string): Promise<Job | null> {
    return this.jobs[jobId] ?? null;
  }
}

describe('getFlowTree', () => {
  it('returns null when no bullmq adapter is registered on the board', async () => {
    const queues = queuesWith(new TestQueueAdapter('bull-queue', {}, 'bull'));
    expect(await getFlowTree(queues, 'bull-queue', '1')).toBeNull();
  });

  it('returns null when the queue cannot assemble the tree', async () => {
    const adapter = new TestQueueAdapter('q');
    expect(await getFlowTree(queuesWith(adapter), 'q', 'missing')).toBeNull();
  });
});

describe('simplifyNode', () => {
  it('returns null for an empty tree', async () => {
    expect(await simplifyNode(null, { remaining: 10, truncated: false })).toBeNull();
  });

  const treeNode = (id: string, children: JobNode[] = []): JobNode =>
    ({
      job: {
        id,
        name: id,
        progress: 0,
        queueName: 'q',
        getState: async () => 'waiting',
      },
      children,
    }) as unknown as JobNode;

  it('marks truncation when the budget lands exactly on a node that still has children', async () => {
    const budget = { remaining: 2, truncated: false };
    const tree = treeNode('root', [treeNode('child', [treeNode('grand-1'), treeNode('grand-2')])]);

    const root = await simplifyNode(tree, budget);

    expect(root?.children).toHaveLength(1);
    expect(budget.truncated).toBe(true);
  });

  it('omits children once the budget is spent mid-tree', async () => {
    const budget = { remaining: 1, truncated: false };
    const tree = treeNode('root', [treeNode('child-1'), treeNode('child-2')]);

    const root = await simplifyNode(tree, budget);

    expect(root?.children).toHaveLength(0);
    expect(budget.truncated).toBe(true);
  });
});

describe('findFlowRoot', () => {
  it('returns null for a job without an id', async () => {
    expect(await findFlowRoot(queuesWith(), job({ id: undefined }))).toBeNull();
  });

  it('returns null when the parent queue is not registered', async () => {
    const queues = queuesWith(new TestQueueAdapter('child-queue'));
    const child = job({ queueName: 'child-queue', opts: { parent: { id: '9', queue: 'missing-queue' } } });
    expect(await findFlowRoot(queues, child)).toBeNull();
  });

  it('returns null when the parent job is gone', async () => {
    const queues = queuesWith(new TestQueueAdapter('child-queue'), new TestQueueAdapter('parent-queue'));
    const child = job({ queueName: 'child-queue', opts: { parent: { id: '9', queue: 'parent-queue' } } });
    expect(await findFlowRoot(queues, child)).toBeNull();
  });

  it('walks the parent chain to the job that has no parent', async () => {
    const parent = job({ id: '9', queueName: 'parent-queue' });
    const queues = queuesWith(
      new TestQueueAdapter('child-queue'),
      new RegistryAdapter('parent-queue', { 9: parent })
    );
    const child = job({ queueName: 'child-queue', opts: { parent: { id: '9', queue: 'parent-queue' } } });

    expect(await findFlowRoot(queues, child)).toEqual({ queueName: 'parent-queue', jobId: '9' });
  });
});

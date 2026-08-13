import { describe, expect, it } from 'vitest';
import { createBullBoard } from './index';
import { BaseAdapter } from './queueAdapters/base';
import type {
  AppControllerRoute,
  BullBoardQueues,
  ControllerHandlerReturnType,
  IServerAdapter,
  JobCounts,
  JobStatus,
  QueueJob,
  Status,
  UIConfig,
} from './typings/app';

class TestQueueAdapter extends BaseAdapter {
  constructor(public readonly name: string) {
    super('bullmq');
  }

  getName(): string {
    return this.name;
  }

  async getJobCounts(): Promise<JobCounts> {
    return {
      latest: 0,
      active: 0,
      waiting: 0,
      'waiting-children': 0,
      prioritized: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      paused: 0,
    };
  }

  async getJobs(_jobStatuses: JobStatus[], _start?: number, _end?: number): Promise<QueueJob[]> {
    return [];
  }

  async isPaused(): Promise<boolean> {
    return false;
  }

  async getGlobalConcurrency(): Promise<number | null> {
    return null;
  }

  async getJobSchedulersCount(): Promise<number> {
    return 0;
  }

  getStatuses(): Status[] {
    return ['latest', ...this.getJobStatuses()];
  }

  getJobStatuses(): JobStatus[] {
    return ['active', 'waiting', 'completed', 'failed', 'delayed'];
  }
}

class TestServerAdapter implements IServerAdapter {
  public queues: BullBoardQueues | undefined;
  public uiConfig: UIConfig | undefined;
  public apiRoutes: AppControllerRoute[] | undefined;
  public errorHandler: ((error: Error) => ControllerHandlerReturnType) | undefined;

  setQueues(queues: BullBoardQueues): IServerAdapter {
    this.queues = queues;
    return this;
  }

  setUIConfig(config: UIConfig): IServerAdapter {
    this.uiConfig = config;
    return this;
  }

  setViewsPath(): IServerAdapter {
    return this;
  }

  setStaticPath(): IServerAdapter {
    return this;
  }

  setEntryRoute(): IServerAdapter {
    return this;
  }

  setErrorHandler(handler: (error: Error) => ControllerHandlerReturnType): IServerAdapter {
    this.errorHandler = handler;
    return this;
  }

  setApiRoutes(routes: AppControllerRoute[]): IServerAdapter {
    this.apiRoutes = routes;
    return this;
  }
}

const createBoard = (queues: BaseAdapter[] = []) => {
  const serverAdapter = new TestServerAdapter();
  const board = createBullBoard({ queues, serverAdapter });
  return { serverAdapter, board };
};

const registeredQueues = (serverAdapter: TestServerAdapter): BullBoardQueues => {
  if (!serverAdapter.queues) {
    throw new Error('createBullBoard never called setQueues on the server adapter');
  }
  return serverAdapter.queues;
};

describe('createBullBoard', () => {
  it('returns the four board methods', () => {
    const { board } = createBoard();
    expect(Object.keys(board).sort()).toEqual(['addQueue', 'removeQueue', 'replaceQueues', 'setQueues']);
    for (const method of Object.values(board)) {
      expect(typeof method).toBe('function');
    }
  });

  it('registers the queues passed at creation', () => {
    const queueA = new TestQueueAdapter('queueA');
    const queueB = new TestQueueAdapter('queueB');
    const { serverAdapter } = createBoard([queueA, queueB]);
    const queues = registeredQueues(serverAdapter);
    expect(queues.size).toBe(2);
    expect(queues.get('queueA')).toBe(queueA);
    expect(queues.get('queueB')).toBe(queueB);
  });

  it('keeps the last adapter when creation queues share a name', () => {
    const first = new TestQueueAdapter('shared');
    const last = new TestQueueAdapter('shared');
    const { serverAdapter } = createBoard([first, last]);
    expect(registeredQueues(serverAdapter).get('shared')).toBe(last);
  });

  it('setQueues merges without clearing existing queues', () => {
    const { serverAdapter, board } = createBoard();
    const queueA = new TestQueueAdapter('queueA');
    const queueB = new TestQueueAdapter('queueB');
    const queueC = new TestQueueAdapter('queueC');
    board.setQueues([queueA, queueB]);
    board.setQueues([queueB, queueC]);
    const queues = registeredQueues(serverAdapter);
    expect(queues.size).toBe(3);
    expect(queues.get('queueA')).toBe(queueA);
    expect(queues.get('queueB')).toBe(queueB);
    expect(queues.get('queueC')).toBe(queueC);
  });

  it('replaceQueues drops queues missing from the new list', () => {
    const { serverAdapter, board } = createBoard();
    const queueA = new TestQueueAdapter('queueA');
    const queueB = new TestQueueAdapter('queueB');
    const queueC = new TestQueueAdapter('queueC');
    board.setQueues([queueA, queueB, queueC]);
    board.replaceQueues([queueB]);
    const queues = registeredQueues(serverAdapter);
    expect(queues.size).toBe(1);
    expect(queues.get('queueB')).toBe(queueB);
  });

  it('replaceQueues registers the new queues', () => {
    const { serverAdapter, board } = createBoard();
    const queueA = new TestQueueAdapter('queueA');
    const queueB = new TestQueueAdapter('queueB');
    board.replaceQueues([queueA, queueB]);
    expect(registeredQueues(serverAdapter).size).toBe(2);
  });

  it('replaceQueues with an empty list clears the board', () => {
    const { serverAdapter, board } = createBoard();
    board.setQueues([new TestQueueAdapter('queueA')]);
    board.replaceQueues([]);
    expect(registeredQueues(serverAdapter).size).toBe(0);
  });

  it('addQueue registers a queue', () => {
    const { serverAdapter, board } = createBoard();
    const queueA = new TestQueueAdapter('queueA');
    board.addQueue(queueA);
    expect(registeredQueues(serverAdapter).get('queueA')).toBe(queueA);
  });

  it('addQueue replaces a queue with the same name', () => {
    const { serverAdapter, board } = createBoard();
    const first = new TestQueueAdapter('queueA');
    const last = new TestQueueAdapter('queueA');
    board.addQueue(first);
    board.addQueue(last);
    const queues = registeredQueues(serverAdapter);
    expect(queues.size).toBe(1);
    expect(queues.get('queueA')).toBe(last);
  });

  it('removeQueue removes a queue by name', () => {
    const { serverAdapter, board } = createBoard();
    board.setQueues([new TestQueueAdapter('queueA'), new TestQueueAdapter('queueB')]);
    board.removeQueue('queueA');
    const queues = registeredQueues(serverAdapter);
    expect(queues.has('queueA')).toBe(false);
    expect(queues.has('queueB')).toBe(true);
  });

  it('removeQueue removes a queue by adapter', () => {
    const { serverAdapter, board } = createBoard();
    const queueA = new TestQueueAdapter('queueA');
    board.setQueues([queueA]);
    board.removeQueue(queueA);
    expect(registeredQueues(serverAdapter).size).toBe(0);
  });

  it('removeQueue is a no-op for unknown queues', () => {
    const { serverAdapter, board } = createBoard();
    board.setQueues([new TestQueueAdapter('queueA')]);
    board.removeQueue('missing');
    expect(registeredQueues(serverAdapter).size).toBe(1);
  });

  it('passes uiConfig options through to the server adapter', () => {
    const serverAdapter = new TestServerAdapter();
    createBullBoard({
      queues: [],
      serverAdapter,
      options: { uiConfig: { boardTitle: 'Ops Board' } },
    });
    expect(serverAdapter.uiConfig?.boardTitle).toBe('Ops Board');
  });

  it('defaults the board title to Bull Dashboard', () => {
    const serverAdapter = new TestServerAdapter();
    createBullBoard({ queues: [], serverAdapter });
    expect(serverAdapter.uiConfig?.boardTitle).toBe('Bull Dashboard');
  });

  it('registers the api routes on the server adapter', () => {
    const { serverAdapter } = createBoard();
    expect(serverAdapter.apiRoutes).toEqual([
      expect.objectContaining({ method: 'get', route: '/api/queues' }),
    ]);
  });

  it('registers an error handler on the server adapter', () => {
    const { serverAdapter } = createBoard();
    expect(typeof serverAdapter.errorHandler).toBe('function');
  });

  it('turns handler errors into a 500 with the stack as details', () => {
    const { serverAdapter } = createBoard();
    const response = serverAdapter.errorHandler!(new Error('kaboom'));
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: 'Queue error',
      details: expect.stringContaining('kaboom'),
    });
  });

  it('falls back to the message when an error has no stack', () => {
    const { serverAdapter } = createBoard();
    const response = serverAdapter.errorHandler!({ message: 'no stack' } as Error);
    expect(response.body).toEqual({
      error: 'Queue error',
      details: 'no stack',
    });
  });
});

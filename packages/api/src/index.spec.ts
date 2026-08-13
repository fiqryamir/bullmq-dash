import { describe, expect, it } from 'vitest';
import { createBullBoard } from './index';
import { BaseAdapter } from './queueAdapters/base';
import type { BullBoardQueues, IServerAdapter, UIConfig } from './typings/app';

class TestQueueAdapter extends BaseAdapter {
  constructor(public readonly name: string) {
    super();
  }

  getName(): string {
    return this.name;
  }
}

class TestServerAdapter implements IServerAdapter {
  public queues: BullBoardQueues | undefined;
  public uiConfig: UIConfig | undefined;

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

  setErrorHandler(): IServerAdapter {
    return this;
  }

  setApiRoutes(): IServerAdapter {
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
});

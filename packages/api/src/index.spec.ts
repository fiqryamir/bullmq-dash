import { describe, expect, it } from 'vitest';
import { createBullBoard } from './index';
import type { BaseAdapter } from './queueAdapters/base';
import { TestQueueAdapter } from './testUtils/TestQueueAdapter';
import type {
  AppControllerRoute,
  AppViewRoute,
  BullBoardQueues,
  ControllerHandlerReturnType,
  IServerAdapter,
  UIConfig,
} from './typings/app';

class TestServerAdapter implements IServerAdapter {
  public queues: BullBoardQueues | undefined;
  public uiConfig: UIConfig | undefined;
  public apiRoutes: AppControllerRoute[] | undefined;
  public errorHandler: ((error: Error) => ControllerHandlerReturnType) | undefined;
  public viewsPath: string | undefined;
  public staticPath: { route: string; path: string } | undefined;
  public entryRoute: AppViewRoute | undefined;

  setQueues(queues: BullBoardQueues): IServerAdapter {
    this.queues = queues;
    return this;
  }

  setUIConfig(config: UIConfig): IServerAdapter {
    this.uiConfig = config;
    return this;
  }

  setViewsPath(viewPath: string): IServerAdapter {
    this.viewsPath = viewPath;
    return this;
  }

  setStaticPath(route: string, path: string): IServerAdapter {
    this.staticPath = { route, path };
    return this;
  }

  setEntryRoute(route: AppViewRoute): IServerAdapter {
    this.entryRoute = route;
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

  it('defaults the board title to bullmq-dash', () => {
    const serverAdapter = new TestServerAdapter();
    createBullBoard({ queues: [], serverAdapter });
    expect(serverAdapter.uiConfig?.boardTitle).toBe('bullmq-dash');
  });

  describe('readOnly', () => {
    it('defaults the board to writable', () => {
      const { serverAdapter } = createBoard();
      expect(serverAdapter.uiConfig?.readOnly).toBe(false);
    });

    it('passes the readOnly option into the uiConfig', () => {
      const serverAdapter = new TestServerAdapter();
      createBullBoard({ queues: [], serverAdapter, options: { readOnly: true } });
      expect(serverAdapter.uiConfig?.readOnly).toBe(true);
    });

    it('never lets the caller uiConfig readOnly override the board option', () => {
      const serverAdapter = new TestServerAdapter();
      createBullBoard({
        queues: [],
        serverAdapter,
        options: { readOnly: false, uiConfig: { readOnly: true } },
      });
      expect(serverAdapter.uiConfig?.readOnly).toBe(false);
    });

    it('honors a uiConfig readOnly when the board option is absent', () => {
      const serverAdapter = new TestServerAdapter();
      createBullBoard({
        queues: [],
        serverAdapter,
        options: { uiConfig: { readOnly: true } },
      });
      expect(serverAdapter.uiConfig?.readOnly).toBe(true);
    });
  });

  describe('UI wiring', () => {
    it('drives the server adapter with the UI package views and static paths', () => {
      const { serverAdapter } = createBoard();
      expect(serverAdapter.viewsPath).toMatch(/[\\/]dist$/);
      expect(serverAdapter.staticPath).toMatchObject({ route: '/assets' });
      expect(serverAdapter.staticPath?.path).toMatch(/[\\/]dist[\\/]assets$/);
    });

    it('registers the SPA entry route rendering the UI template', () => {
      const { serverAdapter } = createBoard();
      expect(serverAdapter.entryRoute).toMatchObject({ method: 'get', route: '/' });
      const view = serverAdapter.entryRoute!.handler({
        basePath: '',
        uiConfig: { boardTitle: 'bullmq-dash' },
      });
      expect(view.name).toBe('index');
      expect(view.params.basePath).toBe('/');
      expect(view.params.uiConfig).toContain('bullmq-dash');
    });

    it('escapes html-unsafe characters in the serialized uiConfig', () => {
      const { serverAdapter } = createBoard();
      const view = serverAdapter.entryRoute!.handler({
        basePath: '',
        uiConfig: { boardTitle: '</script><script>alert(1)</script>' },
      });
      expect(view.params.uiConfig).not.toContain('<');
      expect(view.params.uiConfig).toContain('\\u003c');
    });

    it('normalizes the base path with a trailing slash', () => {
      const { serverAdapter } = createBoard();
      const view = serverAdapter.entryRoute!.handler({ basePath: '/board', uiConfig: {} });
      expect(view.params.basePath).toBe('/board/');
    });

    it('honors options.uiBasePath over the resolved UI package', () => {
      const serverAdapter = new TestServerAdapter();
      createBullBoard({ queues: [], serverAdapter, options: { uiBasePath: '/custom/ui' } });
      expect(serverAdapter.viewsPath).toMatch(/custom[\\/]ui[\\/]dist$/);
    });
  });

  it('registers the api routes on the server adapter', () => {
    const { serverAdapter } = createBoard();
    expect(serverAdapter.apiRoutes).toEqual([
      expect.objectContaining({ method: 'get', route: '/api/queues' }),
      expect.objectContaining({ method: 'get', route: '/api/search' }),
      expect.objectContaining({ method: 'get', route: '/api/queues/:queueName/jobs' }),
      expect.objectContaining({ method: 'get', route: '/api/queues/:queueName/search' }),
      expect.objectContaining({ method: 'get', route: '/api/queues/:queueName/flow' }),
      expect.objectContaining({ method: 'get', route: '/api/queues/:queueName/:jobId/logs' }),
      expect.objectContaining({ method: 'get', route: '/api/queues/:queueName/:jobId/flow' }),
      expect.objectContaining({ method: 'get', route: '/api/queues/:queueName/:jobId' }),
      expect.objectContaining({
        method: 'put',
        route: '/api/queues/:queueName/retry/:queueStatus',
      }),
      expect.objectContaining({ method: 'put', route: '/api/queues/:queueName/promote' }),
      expect.objectContaining({
        method: 'put',
        route: '/api/queues/:queueName/clean/:queueStatus',
      }),
      expect.objectContaining({
        method: 'put',
        route: '/api/queues/:queueName/remove/:queueStatus',
      }),
      expect.objectContaining({ method: 'put', route: '/api/queues/:queueName/pause' }),
      expect.objectContaining({ method: 'put', route: '/api/queues/:queueName/resume' }),
      expect.objectContaining({ method: 'put', route: '/api/queues/:queueName/empty' }),
      expect.objectContaining({ method: 'put', route: '/api/queues/:queueName/:jobId/retry' }),
      expect.objectContaining({ method: 'put', route: '/api/queues/:queueName/:jobId/promote' }),
      expect.objectContaining({ method: 'put', route: '/api/queues/:queueName/:jobId/clean' }),
      expect.objectContaining({ method: 'put', route: '/api/queues/:queueName/:jobId/remove' }),
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

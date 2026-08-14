import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createBullBoard } from '@bullmq-dash/api';
import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { FastifyAdapter } from './index';

const uiDist = resolve(process.cwd(), '../ui/dist');

async function mountAdapter(serverAdapter: FastifyAdapter, prefix?: string): Promise<FastifyInstance> {
  const app = Fastify();
  if (prefix) {
    app.register(serverAdapter.registerPlugin(), { prefix });
  } else {
    app.register(serverAdapter.registerPlugin());
  }
  await app.ready();
  return app;
}

describe('FastifyAdapter serving the UI SPA', () => {
  it('serves the SPA entry with the injected uiConfig', async () => {
    const serverAdapter = new FastifyAdapter();
    createBullBoard({ queues: [], serverAdapter });
    const app = await mountAdapter(serverAdapter);

    const response = await app.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('id="root"');
    expect(response.body).toContain('__UI_CONFIG__');
    expect(response.body).toContain('bullmq-dash');
    expect(response.body).toContain('<base href="/">');
    await app.close();
  });

  it('injects uiConfig options passed to createBullBoard', async () => {
    const serverAdapter = new FastifyAdapter();
    createBullBoard({
      queues: [],
      serverAdapter,
      options: { uiConfig: { boardTitle: 'Ops Board' } },
    });
    const app = await mountAdapter(serverAdapter);

    const response = await app.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Ops Board');
    await app.close();
  });

  it('serves the built static assets under /assets', async () => {
    const serverAdapter = new FastifyAdapter();
    createBullBoard({ queues: [], serverAdapter });
    const app = await mountAdapter(serverAdapter);

    const html = readFileSync(resolve(uiDist, 'index.html'), 'utf8');
    const assetRef = html.match(/\.\/assets\/[^"']+\.js/)?.[0];
    expect(assetRef, 'built html should reference a hashed asset').toBeTruthy();

    const response = await app.inject({ method: 'GET', url: assetRef!.replace(/^\./, '') });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('renders the entry under a host-app base path', async () => {
    const serverAdapter = new FastifyAdapter().setBasePath('/board');
    createBullBoard({ queues: [], serverAdapter });
    const app = await mountAdapter(serverAdapter, '/board');

    const response = await app.inject({ method: 'GET', url: '/board/' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<base href="/board/">');
    await app.close();
  });

  it('derives the base path from the plugin prefix when unset', async () => {
    const serverAdapter = new FastifyAdapter();
    createBullBoard({ queues: [], serverAdapter });
    const app = await mountAdapter(serverAdapter, '/ops');

    const response = await app.inject({ method: 'GET', url: '/ops/' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<base href="/ops/">');
    await app.close();
  });
});

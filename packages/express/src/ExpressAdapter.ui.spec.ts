import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createBullBoard } from '@bullmq-dash/api';
import express, { type Express } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ExpressAdapter } from './index';

const uiDist = resolve(process.cwd(), '../ui/dist');

function mountAdapter(serverAdapter: ExpressAdapter): Express {
  const app = express();
  app.use(serverAdapter.getRouter());
  return app;
}

describe('ExpressAdapter serving the UI SPA', () => {
  it('serves the SPA entry with the injected uiConfig', async () => {
    const serverAdapter = new ExpressAdapter();
    createBullBoard({ queues: [], serverAdapter });
    const response = await request(mountAdapter(serverAdapter)).get('/').expect(200);
    expect(response.text).toContain('id="root"');
    expect(response.text).toContain('__UI_CONFIG__');
    expect(response.text).toContain('bullmq-dash');
    expect(response.text).toContain('<base href="/">');
  });

  it('injects uiConfig options passed to createBullBoard', async () => {
    const serverAdapter = new ExpressAdapter();
    createBullBoard({
      queues: [],
      serverAdapter,
      options: { uiConfig: { boardTitle: 'Ops Board' } },
    });
    const response = await request(mountAdapter(serverAdapter)).get('/').expect(200);
    expect(response.text).toContain('Ops Board');
  });

  it('serves the built static assets under /assets', async () => {
    const serverAdapter = new ExpressAdapter();
    createBullBoard({ queues: [], serverAdapter });
    const html = readFileSync(resolve(uiDist, 'index.html'), 'utf8');
    const assetRef = html.match(/\.\/assets\/[^"']+\.js/)?.[0];
    expect(assetRef, 'built html should reference a hashed asset').toBeTruthy();
    await request(mountAdapter(serverAdapter))
      .get(assetRef!.replace(/^\./, ''))
      .expect(200);
  });

  it('renders the entry under a host-app base path', async () => {
    const serverAdapter = new ExpressAdapter().setBasePath('/board');
    createBullBoard({ queues: [], serverAdapter });
    const mounted = express();
    mounted.use('/board', serverAdapter.getRouter());
    const response = await request(mounted).get('/board/').expect(200);
    expect(response.text).toContain('<base href="/board/">');
  });
});

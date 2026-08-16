import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// The CLI's flag/env surface is the source of truth this guide must stay
// in sync with. Imported from the module that defines it rather than the
// package entry, because the entry pulls in the server stack, which needs
// built `dist` output that does not exist when CI runs tests.
import { CLI_ENV_VARS, CLI_OPTIONS } from '../../packages/standalone/src/config';

const WEBSITE_DIR = fileURLToPath(new URL('..', import.meta.url));
const GUIDES_DIR = path.join(WEBSITE_DIR, 'src', 'content', 'docs', 'guides');

/** The five guides from the spec, one page per adapter/feature. */
const GUIDE_SLUGS = [
  'quick-start',
  'express',
  'fastify',
  'nestjs',
  'standalone',
  'migration',
  'search',
  'flow',
  'metrics',
];

async function readGuide(slug: string): Promise<{ frontmatter: Record<string, string>; body: string }> {
  const file = await readFile(path.join(GUIDES_DIR, `${slug}.md`), 'utf8');
  const frontmatterMatch = file.match(/^---\n([\s\S]*?)\n---\n/);
  if (!frontmatterMatch) {
    throw new Error(`guide '${slug}' has no YAML frontmatter`);
  }
  const frontmatter: Record<string, string> = {};
  for (const line of frontmatterMatch[1].split('\n')) {
    const kv = line.match(/^([A-Za-z-]+):\s*(.*)$/);
    if (kv) {
      frontmatter[kv[1]] = kv[2];
    }
  }
  return { frontmatter, body: file.replace(frontmatterMatch[0], '') };
}

describe('the five guides', () => {
  it('exists as exactly the spec pages', async () => {
    const files = (await readdir(GUIDES_DIR)).filter((f) => f.endsWith('.md'));
    expect(files.sort()).toEqual([...GUIDE_SLUGS].map((slug) => `${slug}.md`).sort());
  });

  it('gives every guide a title and description', async () => {
    for (const slug of GUIDE_SLUGS) {
      const { frontmatter } = await readGuide(slug);
      expect(frontmatter.title, `${slug}.title`).toBeTruthy();
      expect(frontmatter.description, `${slug}.description`).toBeTruthy();
    }
  });

  it('quick start covers both entry points', async () => {
    const { body } = await readGuide('quick-start');
    expect(body).toContain('@bullmq-dash/standalone');
    expect(body).toContain('createBullBoard');
    expect(body).toContain('@bullmq-dash/express');
  });

  it('express guide documents the adapter contract', async () => {
    const { body } = await readGuide('express');
    expect(body).toContain('@bullmq-dash/express');
    expect(body).toContain('ExpressAdapter');
    expect(body).toContain('createBullBoard');
    expect(body).toContain('getRouter');
    expect(body).toContain('setBasePath');
  });

  it('fastify guide documents the adapter contract', async () => {
    const { body } = await readGuide('fastify');
    expect(body).toContain('@bullmq-dash/fastify');
    expect(body).toContain('FastifyAdapter');
    expect(body).toContain('createBullBoard');
    expect(body).toContain('registerPlugin');
  });

  it('nestjs guide documents the module contract', async () => {
    const { body } = await readGuide('nestjs');
    expect(body).toContain('@bullmq-dash/nestjs');
    expect(body).toContain('BullBoardModule');
    expect(body).toContain('forRoot');
    expect(body).toContain('forFeature');
  });

  it('standalone guide documents every flag the CLI accepts', async () => {
    const { body } = await readGuide('standalone');
    for (const flag of Object.keys(CLI_OPTIONS)) {
      expect(body, `--${flag}`).toContain(`--${flag}`);
    }
  });

  it('standalone guide documents every env var the CLI reads', async () => {
    const { body } = await readGuide('standalone');
    for (const envVar of Object.values(CLI_ENV_VARS)) {
      expect(body, envVar).toContain(envVar);
    }
  });

  it('standalone guide documents the JSON config file, precedence and the allow-list', async () => {
    const { body } = await readGuide('standalone');
    expect(body).toContain('"redis"');
    expect(body).toContain('"queues"');
    expect(body).toContain('Flags win over env vars, which win over the config file.');
    expect(body).toContain('empty list shows nothing');
    expect(body).toContain('default: all');
  });

  it('migration guide covers the drop-in mirror', async () => {
    const { body } = await readGuide('migration');
    expect(body).toContain('@bull-board/api');
    expect(body).toContain('@bullmq-dash/api');
    expect(body).toContain('createBullBoard');
    expect(body).toContain('BullMQAdapter');
    expect(body).toContain('IServerAdapter');
    expect(body).toContain('drop-in');
  });

  it('search guide documents the endpoint, contract and deepening', async () => {
    const { body } = await readGuide('search');
    expect(body).toContain('/api/search');
    expect(body).toContain('/api/queues/:queueName/search');
    expect(body).toContain('totalScanned');
    expect(body).toContain('deepen');
    expect(body).toContain('5,000');
    expect(body).toContain('500');
  });

  it('flow guide documents the queue graph and its caps', async () => {
    const { body } = await readGuide('flow');
    expect(body).toContain('/api/queues/:queueName/flow');
    expect(body).toContain('/api/queues/:queueName/:jobId/flow');
    expect(body).toContain('200');
    expect(body).toContain('truncated');
    expect(body).toContain('waiting-children');
  });

  it('metrics guide documents the Redis store and board options', async () => {
    const { body } = await readGuide('metrics');
    expect(body).toContain('retentionSeconds');
    expect(body).toContain('bullmq-dash:metrics');
    expect(body).toContain('7 days');
    expect(body).toContain('QueueEvents');
    expect(body).toContain('BoardOptions');
  });
});

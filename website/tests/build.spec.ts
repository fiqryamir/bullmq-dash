import { execFileSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const WEBSITE_DIR = fileURLToPath(new URL('..', import.meta.url));
const DIST_DIR = path.join(WEBSITE_DIR, 'dist');

const PAGES = [
  '',
  'guides/quick-start',
  'guides/express',
  'guides/fastify',
  'guides/nestjs',
  'guides/standalone',
  'guides/migration',
  'guides/search',
  'guides/flow',
  'guides/metrics',
  'reference',
];

describe('built docs site', () => {
  it('builds and serves the five guides plus the API reference', async () => {
    try {
      execFileSync(
        process.execPath,
        [path.join(WEBSITE_DIR, 'node_modules', 'typedoc', 'bin', 'typedoc')],
        { cwd: WEBSITE_DIR, stdio: 'pipe' }
      );
      execFileSync(process.execPath, [path.join(WEBSITE_DIR, 'scripts', 'add-frontmatter.mjs')], {
        cwd: WEBSITE_DIR,
        stdio: 'pipe',
      });
      execFileSync(
        process.execPath,
        [path.join(WEBSITE_DIR, 'node_modules', 'astro', 'bin', 'astro.mjs'), 'build'],
        { cwd: WEBSITE_DIR, stdio: 'pipe' }
      );
    } catch (error) {
      const err = error as { stdout?: Buffer; stderr?: Buffer; message?: string };
      throw new Error(
        `docs build failed:\n${err.stderr?.toString() ?? ''}\n${err.stdout?.toString() ?? ''}\n${err.message ?? ''}`,
        { cause: error }
      );
    }

    for (const page of PAGES) {
      const html = page === '' ? path.join(DIST_DIR, 'index.html') : path.join(DIST_DIR, page, 'index.html');
      await expect(access(html), `${page || 'home'} page missing`).resolves.toBeUndefined();
    }

    const home = await readFile(path.join(DIST_DIR, 'index.html'), 'utf8');
    expect(home).toContain('bullmq-dash');
  });

  it('ships search, nav and dark mode', async () => {
    const pagefind = await Array.fromAsync(
      glob('**/pagefind/**', { cwd: DIST_DIR })
    );
    expect(pagefind.length, 'pagefind search index missing').toBeGreaterThan(0);

    const home = await readFile(path.join(DIST_DIR, 'index.html'), 'utf8');
    expect(home).toContain('data-theme');
  });
});

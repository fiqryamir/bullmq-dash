import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const WEBSITE_DIR = fileURLToPath(new URL('..', import.meta.url));
const API_DIR = path.join(WEBSITE_DIR, '..', 'packages', 'api', 'src');

/**
 * The public export surface of `@bullmq-dash/api` - anything a guide or
 * consumer can import must be documented by the generated reference.
 */
async function collectExportNames(): Promise<string[]> {
  const names = new Set<string>();
  const index = await readFile(path.join(API_DIR, 'index.ts'), 'utf8');
  for (const match of index.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}\s+from/g)) {
    for (const raw of match[1].split(',')) {
      const name = raw.trim().replace(/^type\s+/, '');
      if (name) {
        names.add(name);
      }
    }
  }
  const app = await readFile(path.join(API_DIR, 'typings', 'app.ts'), 'utf8');
  for (const match of app.matchAll(/export\s+(?:type|interface)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(match[1]);
  }
  return [...names];
}

async function walkFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

describe('TypeDoc API reference', () => {
  it('generates a page for every public export of the core', async () => {
    const out = await mkdtemp(path.join(tmpdir(), 'bullmq-dash-typedoc-'));
    try {
      execFileSync(
        process.execPath,
        [path.join(WEBSITE_DIR, 'node_modules', 'typedoc', 'bin', 'typedoc'), '--options', 'typedoc.json', '--out', out],
        { cwd: WEBSITE_DIR, stdio: 'pipe' }
      );
    } catch (error) {
      const err = error as { stdout?: Buffer; stderr?: Buffer; message?: string };
      throw new Error(
        `typedoc failed:\n${err.stderr?.toString() ?? ''}\n${err.stdout?.toString() ?? ''}\n${err.message ?? ''}`,
        { cause: error }
      );
    }

    const files = (await walkFiles(out)).filter((file) => file.endsWith('.md'));
    expect(files.length).toBeGreaterThan(0);

    let docs = '';
    for (const file of files) {
      docs += (await readFile(file, 'utf8')) + '\n';
    }

    const expected = await collectExportNames();
    expect(expected.length).toBeGreaterThan(30);
    for (const symbol of expected) {
      expect(docs, `reference must document '${symbol}'`).toContain(symbol);
    }
  });
});

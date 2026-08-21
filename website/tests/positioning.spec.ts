import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const WEBSITE_DIR = fileURLToPath(new URL('..', import.meta.url));
const REPO_ROOT = path.resolve(WEBSITE_DIR, '..');
const DOCS_DIR = path.join(WEBSITE_DIR, 'src', 'content', 'docs');

/** The surfaces that carry the public product positioning. */
const POSITIONING_SURFACES = {
  'README.md': path.join(REPO_ROOT, 'README.md'),
  'docs index': path.join(DOCS_DIR, 'index.md'),
  'quick start': path.join(DOCS_DIR, 'guides', 'quick-start.md'),
  'job detail guide': path.join(DOCS_DIR, 'guides', 'job-detail.md'),
} as const;

/**
 * Concepts alpha.3 must never promise. Every occurrence in positioning
 * copy has to sit inside an explicit boundary statement (a negation or a
 * scope marker); a bare positive use fails.
 */
const GUARDED_TERMS: RegExp[] = [
  /root[- ]cause/gi,
  /incidents?\b/gi,
  /health\b/gi,
  /bottlenecks?\b/gi,
  /tracing\b/gi,
  /instrumentation/gi,
  /lifecycle/gi,
];

const BOUNDARY_CONTEXT =
  /\b(no|not|never|without|cannot|can't|does not|doesn't|won't|isn't|aren't|out of scope|post-alpha|future)\b/i;

async function readSource(file: string): Promise<string> {
  return readFile(file, 'utf8');
}

describe('BullMQ DevTools positioning', () => {
  for (const [name, file] of Object.entries(POSITIONING_SURFACES)) {
    it(`${name} states the category and the retained-evidence promise`, async () => {
      const source = await readSource(file);
      expect(source).toContain('BullMQ DevTools');
      expect(source).toContain('evidence BullMQ still retains');
    });

    it(`${name} uses guarded concepts only inside explicit limits`, async () => {
      const source = await readSource(file);
      for (const term of GUARDED_TERMS) {
        for (const match of source.matchAll(term)) {
          const index = match.index ?? 0;
          const before = source.slice(Math.max(0, index - 80), index);
          const snippet = source.slice(Math.max(0, index - 40), index + match[0].length + 40);
          expect(
            BOUNDARY_CONTEXT.test(before),
            `'${match[0]}' in ${name} must appear only as a stated limit, near: …${snippet.replace(/\s+/g, ' ')}…`,
          ).toBe(true);
        }
      }
    });
  }

  it('getting started links the Job detail guide', async () => {
    const source = await readSource(path.join(DOCS_DIR, 'guides', 'quick-start.md'));
    expect(source).toContain('/guides/job-detail');
  });
});

describe('Job detail guidance', () => {
  const jobDetail = POSITIONING_SURFACES['job detail guide'];

  it('presents Job detail as the public name of one shared surface', async () => {
    const source = await readSource(jobDetail);
    expect(source).toContain('Job detail');
    expect(source).toContain('job dossier');
    expect(source).toContain('Evidence ledger');
    expect(source).toMatch(/one route,\s+one\s+page,\s+three names for the same thing/i);
    expect(source).toMatch(/same surface/i);
  });

  it('documents every entry route with preserved context', async () => {
    const source = await readSource(jobDetail);
    expect(source).toMatch(/Job search/);
    expect(source).toMatch(/jobs table/i);
    expect(source).toMatch(/Flow node/i);
    expect(source).toMatch(/back navigation|back returns/i);
  });

  it('explains attempts and evidence gaps without implying per-attempt history', async () => {
    const source = await readSource(jobDetail);
    expect(source).toMatch(/attempt count|aggregate count/i);
    expect(source).toContain('evidence gap');
    expect(source).toMatch(/no per-attempt history|No durable per-attempt record/);
  });

  it('keeps related views bounded and actions secondary', async () => {
    const source = await readSource(jobDetail);
    expect(source).toContain('Bounded context links');
    expect(source).toMatch(/readOnly/);
    expect(source).toMatch(/retry/i);
  });

  it('serves embedded and standalone adopters alike', async () => {
    const source = await readSource(jobDetail);
    expect(source).toMatch(/embedded/i);
    expect(source).toMatch(/standalone/i);
  });

  it('does not fold queue metrics into the job explanation', async () => {
    const source = await readSource(jobDetail);
    expect(source.toLowerCase()).not.toContain('metric');
  });
});

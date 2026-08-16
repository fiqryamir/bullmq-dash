// Adds Starlight-compatible frontmatter to the TypeDoc-generated reference
// pages: every docs collection entry needs a `title`, so this derives one
// from each page's breadcrumb line (the page's own name), or from the
// project name for the index page, and prepends it.

import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { walkFiles } from './walk-files.mjs';

const WEBSITE_DIR = path.join(import.meta.dirname, '..');
const REFERENCE_DIR = path.join(WEBSITE_DIR, 'src', 'content', 'docs', 'reference');

const projectName = JSON.parse(await readFile(path.join(WEBSITE_DIR, 'typedoc.json'), 'utf8')).name;

const files = (await walkFiles(REFERENCE_DIR)).filter((file) => file.endsWith('.md'));

for (const file of files) {
  const content = await readFile(file, 'utf8');
  if (content.startsWith('---')) {
    continue;
  }
  let title;
  if (path.basename(file) === 'README.md') {
    title = projectName;
  } else {
    const breadcrumb = content.match(/^\[[^\]]*\]\([^)]*\) \/ (.+)$/m)?.[1];
    title = (breadcrumb ?? path.basename(file, '.md'))
      .replace(/\*\*/g, '')
      .replace(/\\/g, '')
      .trim();
  }
  await writeFile(file, `---\ntitle: "${title.replace(/"/g, '\\"')}"\n---\n\n${content}`);

  if (path.basename(file) === 'README.md') {
    // Starlight serves README.md as its own slug; rename so the reference
    // root is the prettier /reference/ index page.
    await rename(file, path.join(path.dirname(file), 'index.md'));
  }
}

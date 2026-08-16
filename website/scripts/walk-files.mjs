import { readdir } from 'node:fs/promises';
import path from 'node:path';

/** Recursively lists every file under `dir`. Shared by the typedoc
 * frontmatter step and the docs build tests.
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
export async function walkFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
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

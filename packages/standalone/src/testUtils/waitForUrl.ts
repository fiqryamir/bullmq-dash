import type { ChildProcess } from 'node:child_process';

/**
 * Resolves the `listening on <url>` line the bin prints once its server is
 * up, rejecting if the process exits or the timeout passes first.
 */
export function waitForUrl(candidate: ChildProcess, timeoutMs = 15_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(
      () => reject(new Error(`bin did not report a listening url. Output:\n${buffer}`)),
      timeoutMs
    );
    candidate.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const match = buffer.match(/listening on (http:\/\/\S+)/);
      if (match?.[1]) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    candidate.stderr?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
    });
    candidate.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`bin exited with code ${code} before listening. Output:\n${buffer}`));
    });
  });
}

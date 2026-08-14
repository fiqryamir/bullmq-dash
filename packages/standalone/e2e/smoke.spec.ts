import { spawn, type ChildProcess } from 'node:child_process';
import { Queue } from 'bullmq';
import { expect, test } from '@playwright/test';

const PREFIX = `e2e-${process.pid}-${Date.now()}`;
const BIN_PATH = new URL('../dist/bin.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const redisOptions = () => ({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
});

let serverUrl: string;
let bin: ChildProcess;

function waitForUrl(candidate: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(
      () => reject(new Error(`bin did not report a listening url. Output:\n${buffer}`)),
      20_000
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

test.beforeAll(async () => {
  const emails = new Queue('smoke-emails', { connection: redisOptions(), prefix: PREFIX });
  const reports = new Queue('smoke-reports', { connection: redisOptions(), prefix: PREFIX });
  await emails.add('welcome-email', { to: 'a@example.com' });
  await emails.add('receipt-email', { to: 'b@example.com' });
  await reports.add('daily-report', { date: '2026-08-14' });
  await Promise.all([emails.close(), reports.close()]);

  bin = spawn(
    process.execPath,
    [BIN_PATH, '--host', '127.0.0.1', '--port', '0', '--redis-prefix', PREFIX],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  serverUrl = await waitForUrl(bin);
});

test.afterAll(() => {
  bin.kill('SIGTERM');
});

test('opens the dashboard and lists every queue', async ({ page }) => {
  await page.goto(serverUrl);

  await expect(page.locator('.queue-item__name', { hasText: 'smoke-emails' })).toBeVisible();
  await expect(page.locator('.queue-item__name', { hasText: 'smoke-reports' })).toBeVisible();
});

test('browses a queue and sees its waiting jobs', async ({ page }) => {
  await page.goto(serverUrl);
  await page.getByRole('button', { name: /smoke-emails/ }).click();

  await expect(page.locator('.queue-jobs__title')).toHaveText('smoke-emails');
  await expect(page.locator('.job-table')).toContainText('welcome-email');
  await expect(page.locator('.job-table')).toContainText('receipt-email');
});

test('searches a job across queues and opens its detail', async ({ page }) => {
  await page.goto(serverUrl);

  await page.getByLabel('Search jobs').fill('receipt');
  const result = page.locator('.command-palette__row').filter({ hasText: 'receipt-email' });
  await expect(result).toBeVisible();
  await result.click();

  await expect(page.locator('.job-detail__job-name')).toHaveText('receipt-email');
});

test('opens the flow view once the queue graph lands (issue #28)', async ({ page }) => {
  test.skip(true, 'the queue-level flow view ships in #28');
  await page.goto(serverUrl);
});

test('opens the metrics view once historical metrics land (issue #29)', async ({ page }) => {
  test.skip(true, 'the metrics view ships in #29');
  await page.goto(serverUrl);
});

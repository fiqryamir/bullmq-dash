import { spawn, type ChildProcess } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { seedQueues, uniquePrefix } from '../src/testUtils/redis';
import { waitForUrl } from '../src/testUtils/waitForUrl';

const PREFIX = uniquePrefix('e2e');
const BIN_PATH = new URL('../dist/bin.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

let serverUrl: string;
let bin: ChildProcess;

test.beforeAll(async () => {
  await seedQueues(PREFIX, [
    {
      name: 'smoke-emails',
      jobs: [
        { name: 'welcome-email', data: { to: 'a@example.com' } },
        { name: 'receipt-email', data: { to: 'b@example.com' } },
      ],
    },
    { name: 'smoke-reports', jobs: [{ name: 'daily-report', data: { date: '2026-08-14' } }] },
  ]);

  bin = spawn(
    process.execPath,
    [BIN_PATH, '--host', '127.0.0.1', '--port', '0', '--redis-prefix', PREFIX],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  serverUrl = await waitForUrl(bin, 20_000);
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

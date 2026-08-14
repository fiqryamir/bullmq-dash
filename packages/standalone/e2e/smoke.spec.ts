import { spawn, type ChildProcess } from 'node:child_process';
import { FlowProducer } from 'bullmq';
import { expect, test } from '@playwright/test';
import { redisOptions, seedQueues, uniquePrefix } from '../src/testUtils/redis';
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

  const producer = new FlowProducer({ connection: redisOptions(), prefix: PREFIX });
  try {
    await producer.add({
      name: 'checkout',
      queueName: 'smoke-emails',
      children: [
        {
          name: 'charge-payment',
          queueName: 'smoke-emails',
          children: [
            { name: 'charge-card', queueName: 'smoke-emails' },
            { name: 'charge-paypal', queueName: 'smoke-emails' },
          ],
        },
        { name: 'send-receipt', queueName: 'smoke-emails' },
        {
          name: 'update-inventory',
          queueName: 'smoke-emails',
          children: [{ name: 'reserve-stock', queueName: 'smoke-emails' }],
        },
      ],
    });
    await producer.add({
      name: 'nightly-report',
      queueName: 'smoke-emails',
      children: [
        {
          name: 'aggregate-sales',
          queueName: 'smoke-emails',
          children: [{ name: 'aggregate-daily', queueName: 'smoke-emails' }],
        },
        { name: 'aggregate-users', queueName: 'smoke-emails' },
      ],
    });
  } finally {
    await producer.close();
  }

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

test('renders a readable flow graph', async ({ page }) => {
  await page.goto(serverUrl);
  await page.getByRole('button', { name: /smoke-emails/ }).click();
  await page.getByRole('button', { name: 'Open flow view' }).click();

  await expect(page.locator('.flow-node', { hasText: 'checkout' })).toBeVisible();
  const transform = await page.locator('.react-flow__viewport').getAttribute('style');
  const scale = Number(transform?.match(/scale\(([\d.]+)\)/)?.[1] ?? 0);
  expect(scale).toBeGreaterThanOrEqual(0.7);
});

test('searches a job across queues and opens its detail', async ({ page }) => {
  await page.goto(serverUrl);

  await page.getByLabel('Search jobs').fill('receipt');
  const result = page.locator('.command-palette__row').filter({ hasText: 'receipt-email' });
  await expect(result).toBeVisible();
  await result.click();

  await expect(page.locator('.job-detail__job-name')).toHaveText('receipt-email');
});

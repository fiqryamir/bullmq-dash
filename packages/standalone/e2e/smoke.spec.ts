import { spawn, type ChildProcess } from 'node:child_process';
import { FlowProducer, Queue, Worker } from 'bullmq';
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
    { name: 'smoke-metrics' },
    { name: 'smoke-schedulers' },
  ]);

  const schedulerQueue = new Queue('smoke-schedulers', {
    connection: redisOptions(),
    prefix: PREFIX,
  });
  await schedulerQueue.upsertJobScheduler(
    'nightly-digest',
    { every: 86_400_000 },
    { name: 'digest' }
  );
  await schedulerQueue.close();

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
  await expect(page.locator('.dash-table')).toContainText('welcome-email');
  await expect(page.locator('.dash-table')).toContainText('receipt-email');
});

test('renders a readable flow graph', async ({ page }) => {
  await page.goto(serverUrl);
  await page.getByRole('button', { name: /smoke-emails/ }).click();
  await page.getByRole('button', { name: 'Open Flow view' }).click();

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

test('captures traffic and renders the metrics view', async ({ page }) => {
  // Jobs added after the server boots, delayed so the dashboard's capture
  // subscription is live before the work runs: the endpoint then serves the
  // event-derived buckets deterministically.
  const queue = new Queue('smoke-metrics', { connection: redisOptions(), prefix: PREFIX });
  const worker = new Worker(
    'smoke-metrics',
    async () => {},
    { connection: redisOptions(), prefix: PREFIX }
  );
  try {
    await queue.add('metric-job', { i: 1 }, { delay: 1_500 });
    await queue.add('metric-job', { i: 2 }, { delay: 1_500 });

    await expect
      .poll(
        async () => {
          const response = await fetch(`${serverUrl}/api/queues/smoke-metrics/metrics`);
          const body = (await response.json()) as {
            buckets?: Array<{ completed: number; durationAvgMs: number | null }>;
          };
          // The queue may not be registered the moment the poll starts; a
          // missing body is a retry, not a failure.
          return body.buckets?.reduce((sum, bucket) => sum + bucket.completed, 0) ?? 0;
        },
        { timeout: 15_000 }
      )
      .toBeGreaterThanOrEqual(2);
  } finally {
    await worker.close();
    await queue.close();
  }

  await page.goto(serverUrl);
  await page.getByRole('button', { name: /smoke-metrics/ }).click();
  await page.getByRole('button', { name: 'Open Metrics view' }).click();

  await expect(page.locator('.metrics-summary')).toContainText(/2 completed/);
  await expect(page.locator('.metrics-chart')).toHaveCount(3);
});

test('manages schedulers from the schedulers view', async ({ page }) => {
  await page.goto(serverUrl);
  await page.getByRole('button', { name: /smoke-schedulers/ }).click();
  await page.getByRole('button', { name: 'Open Schedulers view' }).click();

  const table = page.locator('.queue-schedulers__table-wrap');
  await expect(table).toContainText('nightly-digest');
  await expect(table).toContainText('every 1d');

  await page.getByRole('button', { name: 'Add scheduler' }).click();
  const form = page.getByRole('form', { name: 'Scheduler form' });
  await form.getByLabel('Scheduler id').fill('hourly-sync');
  await form.getByLabel('Schedule kind').selectOption('every');
  await form.getByLabel('Interval in milliseconds').fill('3600000');
  await form.getByLabel('Job name').fill('sync');
  await form.getByRole('button', { name: 'Add' }).click();

  await expect(table).toContainText('hourly-sync');
  await expect(table).toContainText('every 1h');

  page.once('dialog', (dialog) => void dialog.accept());
  await table.getByRole('button', { name: 'Remove scheduler hourly-sync' }).click();
  await expect(table).not.toContainText('hourly-sync');
});

test('renders the workers and Redis tabs', async ({ page }) => {
  await page.goto(serverUrl);
  await page.getByRole('button', { name: /smoke-schedulers/ }).click();

  await page.getByRole('button', { name: 'Open Workers view' }).click();
  await expect(page.locator('.queue-workers')).toContainText('No workers connected');

  await page.getByRole('button', { name: 'Open Redis view' }).click();
  const stats = page.locator('.redis-stats');
  await expect(stats).toContainText('Version');
  await expect(stats).toContainText('Memory used');
  await expect(stats).toContainText('Connected clients');
});

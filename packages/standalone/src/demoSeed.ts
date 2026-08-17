import { Queue, Worker, type Job, type QueueOptions } from 'bullmq';
import { resolveStandaloneConfig } from './config';

const DEMO_QUEUE = 'bullmq-dash-demo';
const METRICS_QUEUE = 'bullmq-dash-metrics';
const WORKERS_QUEUE = 'bullmq-dash-workers';
const DEMO_QUEUE_NAMES = [DEMO_QUEUE, METRICS_QUEUE, WORKERS_QUEUE] as const;
const METRICS_COMPLETED_COUNT = 4;
const METRICS_FAILED_COUNT = 2;
const DASHBOARD_WAIT_MS = 120_000;

type DemoConfig = ReturnType<typeof resolveStandaloneConfig>['config'];

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function queueOptions(config: DemoConfig): QueueOptions {
  const { redis } = config;
  return {
    connection: {
      host: redis.host,
      port: redis.port,
      db: redis.db,
      ...(redis.password !== undefined ? { password: redis.password } : {}),
    },
    prefix: redis.prefix,
  };
}

async function waitForDashboard(url: string): Promise<void> {
  const deadline = Date.now() + DASHBOARD_WAIT_MS;
  let warnedAboutDiscovery = false;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/queues`);
      if (response.ok) {
        const body = (await response.json()) as {
          queues?: Array<{ name?: unknown }>;
        };
        const names = new Set(
          (body.queues ?? [])
            .map((queue) => (typeof queue.name === 'string' ? queue.name : undefined))
            .filter((name): name is string => name !== undefined)
        );
        if (DEMO_QUEUE_NAMES.every((name) => names.has(name))) {
          // Give the board's asynchronous metrics listener time to attach.
          await sleep(500);
          return;
        }
        if (!warnedAboutDiscovery) {
          console.log(
            `Dashboard is reachable at ${url}; waiting for it to discover the demo queues...`
          );
          warnedAboutDiscovery = true;
        }
      }
    } catch {
      // The dashboard may not have started yet; keep polling until the deadline.
    }
    await sleep(500);
  }

  throw new Error(
    `Dashboard did not expose ${DEMO_QUEUE_NAMES.join(', ')} within ${DASHBOARD_WAIT_MS / 1000}s. ` +
      `Start or restart bullmq-dash at ${url} and run pnpm demo:seed again.`
  );
}

async function waitForMetricsBatch(
  queue: Queue,
  before: { completed: number; failed: number }
): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const counts = await queue.getJobCounts('completed', 'failed');
    if (
      (counts.completed ?? 0) >= before.completed + METRICS_COMPLETED_COUNT &&
      (counts.failed ?? 0) >= before.failed + METRICS_FAILED_COUNT
    ) {
      return;
    }
    await sleep(100);
  }

  throw new Error('The metrics worker did not finish the fixed demo batch within 30s.');
}

async function addStaticDemoData(demoQueue: Queue, workersQueue: Queue): Promise<void> {
  await demoQueue.addBulk([
    { name: 'send-welcome-email', data: { recipient: 'ada@example.com' } },
    { name: 'generate-invoice', data: { invoice: 'INV-2048' } },
    { name: 'sync-search-index', data: { collection: 'jobs' } },
    { name: 'refresh-cache', data: { region: 'us-east-1' } },
  ]);
  await demoQueue.add(
    'rebuild-analytics-report',
    { report: 'weekly-throughput' },
    { delay: 60 * 60 * 1000 }
  );
  await demoQueue.upsertJobScheduler(
    'every-minute',
    { every: 60_000 },
    { name: 'scheduler-minute', data: { source: 'demo' } }
  );
  await demoQueue.upsertJobScheduler(
    'every-five-minutes',
    { every: 5 * 60_000 },
    { name: 'scheduler-five-minutes', data: { source: 'demo' } }
  );
  await workersQueue.add(
    'worker-visibility-check',
    { note: 'The demo worker stays connected while this delayed job waits.' },
    { delay: 60 * 60 * 1000 }
  );
}

async function addMetricsBatch(queue: Queue, worker: Worker): Promise<void> {
  await worker.waitUntilReady();
  const counts = await queue.getJobCounts('completed', 'failed');
  const before = {
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
  };
  const jobs = Array.from(
    { length: METRICS_COMPLETED_COUNT + METRICS_FAILED_COUNT },
    (_, index) => ({
      name:
        index < METRICS_COMPLETED_COUNT
          ? `metrics-completed-${index + 1}`
          : `metrics-failed-${index - METRICS_COMPLETED_COUNT + 1}`,
      data: { batch: 'fixed-demo', index: index + 1 },
    })
  );

  await queue.addBulk(jobs);
  await waitForMetricsBatch(queue, before);
}

async function processMetricsJob(job: Job): Promise<{ ok: true }> {
  await sleep(100);
  if (job.name.startsWith('metrics-failed-')) {
    throw new Error('Intentional demo failure for the metrics view.');
  }
  return { ok: true };
}

async function main(): Promise<void> {
  const { config } = resolveStandaloneConfig({ argv: [], env: process.env });
  const options = queueOptions(config);
  const dashboardUrl = (
    process.env.BULLMQ_DASH_URL ?? `http://${config.host}:${config.port}`
  ).replace(/\/$/, '');

  const demoQueue = new Queue(DEMO_QUEUE, options);
  const metricsQueue = new Queue(METRICS_QUEUE, options);
  const workersQueue = new Queue(WORKERS_QUEUE, options);
  let metricsWorker: Worker | undefined;
  let liveWorker: Worker | undefined;
  let stopping = false;

  const close = async (): Promise<void> => {
    if (stopping) {
      return;
    }
    stopping = true;
    await metricsWorker?.close();
    await liveWorker?.close();
    await Promise.all([demoQueue.close(), metricsQueue.close(), workersQueue.close()]);
  };

  const onSignal = () => {
    console.log('\nStopping demo worker. Seeded queue data will remain in Redis.');
    void close().then(
      () => process.exit(0),
      () => process.exit(1)
    );
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  try {
    await Promise.all([
      demoQueue.waitUntilReady(),
      metricsQueue.waitUntilReady(),
      workersQueue.waitUntilReady(),
    ]);
    await addStaticDemoData(demoQueue, workersQueue);

    liveWorker = new Worker(WORKERS_QUEUE, async () => undefined, {
      ...options,
      name: 'demo-worker',
    });
    await liveWorker.waitUntilReady();

    console.log(`Demo queues prepared under Redis prefix "${config.redis.prefix}".`);
    console.log(`Waiting for dashboard at ${dashboardUrl} before running metrics...`);
    await waitForDashboard(dashboardUrl);

    metricsWorker = new Worker(METRICS_QUEUE, processMetricsJob, {
      ...options,
      name: 'metrics-batch-worker',
    });
    await addMetricsBatch(metricsQueue, metricsWorker);
    await metricsWorker.close();
    metricsWorker = undefined;

    console.log(
      `Seeded ${METRICS_COMPLETED_COUNT} completed and ${METRICS_FAILED_COUNT} failed metric jobs.`
    );
    console.log(`Live worker: demo-worker on ${WORKERS_QUEUE}. Press Ctrl+C to stop it.`);
    await new Promise<void>(() => {});
  } catch (error) {
    await close();
    throw error;
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
}

await main().catch((error: unknown) => {
  console.error(`demo:seed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

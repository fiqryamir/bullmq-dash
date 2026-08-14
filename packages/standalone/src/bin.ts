import { main } from './cli';

const handle = await main(process.argv.slice(2), process.env).catch((error: unknown) => {
  console.error(`bullmq-dash: ${error instanceof Error ? error.message : String(error)}`);
  console.error('Run `bullmq-dash --help` for usage.');
  process.exit(1);
});

if (!handle) {
  process.exit(0);
}

const shutdown = () => {
  handle.close().then(
    () => process.exit(0),
    () => process.exit(1)
  );
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

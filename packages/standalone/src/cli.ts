import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolveStandaloneConfig, type StandaloneConfigFile } from './config';
import {
  startStandaloneServer,
  type StandaloneServerHandle,
} from './server';

const USAGE = `Usage: bullmq-dash [options]

A ready-to-run BullMQ dashboard server. Shows every queue on the Redis
connection by default; narrow with --queues. Binds localhost by default -
no auth in v1, do not expose publicly.

Options:
  --config <path>         JSON config file (also: BULLMQ_DASH_CONFIG env)
  --host <host>           Host to bind (default: localhost)
  --port <port>           Port to listen on (default: 3000)
  --redis-host <host>     Redis host (default: localhost)
  --redis-port <port>     Redis port (default: 6379)
  --redis-password <pass> Redis password
  --redis-db <db>         Redis database index (default: 0)
  --redis-prefix <prefix> BullMQ key prefix (default: bull)
  --queues <a,b,c>        Allow-list of queue names to show (default: all)
  --help                  Show this help
  --version               Show the version

Environment:
  BULLMQ_DASH_CONFIG      config file path (same as --config)
  BULLMQ_DASH_HOST        host to bind (same as --host)
  BULLMQ_DASH_PORT        port to listen on (same as --port)
  REDIS_HOST              Redis host (same as --redis-host)
  REDIS_PORT              Redis port (same as --redis-port)
  REDIS_PASSWORD          Redis password (same as --redis-password)
  REDIS_DB                Redis database index (same as --redis-db)
  REDIS_PREFIX            BullMQ key prefix (same as --redis-prefix)
  BULLMQ_DASH_QUEUES      comma-separated allow-list (same as --queues)

Config file shape:
  { "host": "localhost", "port": 3000,
    "redis": { "host": "localhost", "port": 6379, "password": "...",
                "db": 0, "prefix": "bull" },
    "queues": ["emails", "reports"] }

Flags win over env vars, which win over the config file.
`;

const WARNING =
  'WARNING: no auth in v1 - the dashboard binds localhost by default; do not expose it publicly.';

export function readConfigFile(path: string): StandaloneConfigFile {
  return JSON.parse(readFileSync(path, 'utf8')) as StandaloneConfigFile;
}

function version(): string {
  const require = createRequire(import.meta.url);
  return require('../package.json').version as string;
}

/**
 * The CLI entry logic, kept free of `process.exit` so tests can drive it
 * in-process. Prints to stdout; returns the running server's handle, or
 * null when the CLI only printed (--help / --version).
 */
export async function main(
  argv: string[],
  env: NodeJS.ProcessEnv
): Promise<StandaloneServerHandle | null> {
  const { config, help, version: showVersion } = resolveStandaloneConfig({
    argv,
    env,
    readConfigFile,
  });

  if (help) {
    console.log(USAGE);
    return null;
  }
  if (showVersion) {
    console.log(version());
    return null;
  }

  const handle: StandaloneServerHandle = await startStandaloneServer(config);
  console.log(`bullmq-dash ${version()} listening on ${handle.url}`);
  console.log(WARNING);

  return handle;
}

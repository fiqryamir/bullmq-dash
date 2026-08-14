import { parseArgs } from 'node:util';

/**
 * A JSON config file the bin reads with `--config <path>` or
 * `BULLMQ_DASH_CONFIG`. Every field is optional; flags and env vars
 * override it field by field.
 */
export type StandaloneConfigFile = {
  host?: string;
  port?: number;
  redis?: {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    prefix?: string;
  };
  queues?: string[];
};

export type RedisConfig = {
  host: string;
  port: number;
  password: string | undefined;
  db: number;
  prefix: string;
};

/** The fully-resolved runtime configuration, with every default filled in. */
export type StandaloneConfig = {
  host: string;
  port: number;
  redis: RedisConfig;
  /** Optional allow-list of queue names; absent, every queue is shown. */
  queues: string[] | undefined;
};

export const STANDALONE_DEFAULTS: StandaloneConfig = {
  host: 'localhost',
  port: 3000,
  redis: {
    host: 'localhost',
    port: 6379,
    password: undefined,
    db: 0,
    prefix: 'bull',
  },
  queues: undefined,
};

const CLI_OPTIONS = {
  config: { type: 'string' },
  host: { type: 'string' },
  port: { type: 'string' },
  'redis-host': { type: 'string' },
  'redis-port': { type: 'string' },
  'redis-password': { type: 'string' },
  'redis-db': { type: 'string' },
  'redis-prefix': { type: 'string' },
  queues: { type: 'string' },
  help: { type: 'boolean' },
  version: { type: 'boolean' },
} as const;

export type ResolvedStandaloneConfig = {
  config: StandaloneConfig;
  help: boolean;
  version: boolean;
};

function parseNumber(field: string, raw: string | undefined): number | undefined {
  if (raw === undefined || raw === '') {
    return undefined;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid ${field}: "${raw}" - expected a non-negative integer`);
  }
  return value;
}

function parseAllowList(raw: string | undefined): string[] | undefined {
  const list = (raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return list.length > 0 ? list : undefined;
}

/**
 * Resolves the runtime configuration with the precedence
 * flags > env vars > JSON config file > defaults.
 */
export function resolveStandaloneConfig(args: {
  argv: string[];
  env: NodeJS.ProcessEnv;
  readConfigFile?: (path: string) => StandaloneConfigFile;
}): ResolvedStandaloneConfig {
  const parsed = parseArgs({
    args: args.argv,
    options: CLI_OPTIONS,
    strict: true,
    allowPositionals: false,
  });

  const help = parsed.values.help === true;
  const version = parsed.values.version === true;

  let file: StandaloneConfigFile = {};
  if (!help && !version) {
    const configPath = parsed.values.config || args.env.BULLMQ_DASH_CONFIG;
    if (configPath) {
      if (!args.readConfigFile) {
        throw new Error('No config file reader configured');
      }
      file = args.readConfigFile(configPath);
    }
  }

  const flag = parsed.values;
  const env = args.env;

  /** The first defined, non-empty source in flag > env > file order. */
  const pick = (values: Array<string | number | undefined>): string | undefined => {
    for (const value of values) {
      if (value !== undefined && value !== '') {
        return String(value);
      }
    }
    return undefined;
  };

  const port = parseNumber('port', pick([flag.port, env.PORT, file.port])) ?? STANDALONE_DEFAULTS.port;
  const redisPort =
    parseNumber('redis port', pick([flag['redis-port'], env.REDIS_PORT, file.redis?.port])) ??
    STANDALONE_DEFAULTS.redis.port;
  const db =
    parseNumber('redis db', pick([flag['redis-db'], env.REDIS_DB, file.redis?.db])) ??
    STANDALONE_DEFAULTS.redis.db;

  const password = pick([flag['redis-password'], env.REDIS_PASSWORD, file.redis?.password]);
  const queues = parseAllowList(pick([flag.queues, env.BULLMQ_DASH_QUEUES, file.queues?.join(',')]));

  return {
    help,
    version,
    config: {
      host: pick([flag.host, env.HOST, file.host]) ?? STANDALONE_DEFAULTS.host,
      port,
      redis: {
        host: pick([flag['redis-host'], env.REDIS_HOST, file.redis?.host]) ?? STANDALONE_DEFAULTS.redis.host,
        port: redisPort,
        password,
        db,
        prefix:
          pick([flag['redis-prefix'], env.REDIS_PREFIX, file.redis?.prefix]) ??
          STANDALONE_DEFAULTS.redis.prefix,
      },
      queues,
    },
  };
}

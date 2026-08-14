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
  /**
   * Allow-list of queue names to show. Present, it wins wholesale - even an
   * empty list, which shows nothing; absent, every queue is shown.
   */
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

function parseAllowList(raw: string): string[] {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
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

  const raw = {
    host: pick([flag.host, env.BULLMQ_DASH_HOST, file.host]),
    port: pick([flag.port, env.BULLMQ_DASH_PORT, file.port]),
    redisHost: pick([flag['redis-host'], env.REDIS_HOST, file.redis?.host]),
    redisPort: pick([flag['redis-port'], env.REDIS_PORT, file.redis?.port]),
    password: pick([flag['redis-password'], env.REDIS_PASSWORD, file.redis?.password]),
    db: pick([flag['redis-db'], env.REDIS_DB, file.redis?.db]),
    prefix: pick([flag['redis-prefix'], env.REDIS_PREFIX, file.redis?.prefix]),
  };

  // An explicitly-present allow-list wins even when empty - an empty list
  // shows nothing, never everything.
  const queues =
    flag.queues !== undefined
      ? parseAllowList(flag.queues)
      : env.BULLMQ_DASH_QUEUES !== undefined
        ? parseAllowList(env.BULLMQ_DASH_QUEUES)
        : file.queues !== undefined
          ? file.queues
          : undefined;

  return {
    help,
    version,
    config: {
      host: raw.host ?? STANDALONE_DEFAULTS.host,
      port: parseNumber('port', raw.port) ?? STANDALONE_DEFAULTS.port,
      redis: {
        host: raw.redisHost ?? STANDALONE_DEFAULTS.redis.host,
        port: parseNumber('redis port', raw.redisPort) ?? STANDALONE_DEFAULTS.redis.port,
        password: raw.password,
        db: parseNumber('redis db', raw.db) ?? STANDALONE_DEFAULTS.redis.db,
        prefix: raw.prefix ?? STANDALONE_DEFAULTS.redis.prefix,
      },
      queues,
    },
  };
}

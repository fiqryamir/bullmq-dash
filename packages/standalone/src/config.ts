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

export const CLI_OPTIONS = {
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

/**
 * The environment variable that shadows each CLI flag - flags win over
 * env vars, which win over the JSON config file.
 */
export const CLI_ENV_VARS = {
  config: 'BULLMQ_DASH_CONFIG',
  host: 'BULLMQ_DASH_HOST',
  port: 'BULLMQ_DASH_PORT',
  'redis-host': 'REDIS_HOST',
  'redis-port': 'REDIS_PORT',
  'redis-password': 'REDIS_PASSWORD',
  'redis-db': 'REDIS_DB',
  'redis-prefix': 'REDIS_PREFIX',
  queues: 'BULLMQ_DASH_QUEUES',
} as const;

type CLIFlag = keyof typeof CLI_ENV_VARS;

/**
 * Every flag except these two has an env var shadow. Declared as a
 * compile-time check: adding a flag to `CLI_OPTIONS` without a matching
 * `CLI_ENV_VARS` entry (or vice versa) fails the build here.
 */
export const FLAGS_WITHOUT_ENV_VAR = ['help', 'version'] as const satisfies readonly Exclude<
  keyof typeof CLI_OPTIONS,
  keyof typeof CLI_ENV_VARS
>[];

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
    const configPath = parsed.values.config || args.env[CLI_ENV_VARS.config];
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

  const envVar = (flagName: CLIFlag): string | undefined => env[CLI_ENV_VARS[flagName]];

  const raw = {
    host: pick([flag.host, envVar('host'), file.host]),
    port: pick([flag.port, envVar('port'), file.port]),
    redisHost: pick([flag['redis-host'], envVar('redis-host'), file.redis?.host]),
    redisPort: pick([flag['redis-port'], envVar('redis-port'), file.redis?.port]),
    password: pick([flag['redis-password'], envVar('redis-password'), file.redis?.password]),
    db: pick([flag['redis-db'], envVar('redis-db'), file.redis?.db]),
    prefix: pick([flag['redis-prefix'], envVar('redis-prefix'), file.redis?.prefix]),
  };

  // An explicitly-present allow-list wins even when empty - an empty list
  // shows nothing, never everything.
  const queues =
    flag.queues !== undefined
      ? parseAllowList(flag.queues)
      : envVar('queues') !== undefined
        ? parseAllowList(envVar('queues') as string)
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

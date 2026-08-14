import { describe, expect, it, vi } from 'vitest';
import { resolveStandaloneConfig, type StandaloneConfigFile } from './config';

const EMPTY_ENV = {};

function fileConfig(overrides: StandaloneConfigFile = {}): StandaloneConfigFile {
  return { ...overrides };
}

describe('resolveStandaloneConfig', () => {
  it('returns the defaults when nothing is configured', () => {
    const { config } = resolveStandaloneConfig({ argv: [], env: EMPTY_ENV });

    expect(config).toEqual({
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
    });
  });

  it('applies every value from a JSON config file', () => {
    const readConfigFile = vi.fn(() =>
      fileConfig({
        host: '0.0.0.0',
        port: 4000,
        redis: { host: 'redis.internal', port: 7000, password: 's3cret', db: 2, prefix: 'jobs' },
        queues: ['emails', 'reports'],
      })
    );

    const { config } = resolveStandaloneConfig({
      argv: ['--config', './dash.json'],
      env: EMPTY_ENV,
      readConfigFile,
    });

    expect(readConfigFile).toHaveBeenCalledWith('./dash.json');
    expect(config).toEqual({
      host: '0.0.0.0',
      port: 4000,
      redis: {
        host: 'redis.internal',
        port: 7000,
        password: 's3cret',
        db: 2,
        prefix: 'jobs',
      },
      queues: ['emails', 'reports'],
    });
  });

  it('reads the config file path from the BULLMQ_DASH_CONFIG env var', () => {
    const readConfigFile = vi.fn(() => fileConfig({ port: 4000 }));

    const { config } = resolveStandaloneConfig({
      argv: [],
      env: { BULLMQ_DASH_CONFIG: '/etc/dash.json' },
      readConfigFile,
    });

    expect(readConfigFile).toHaveBeenCalledWith('/etc/dash.json');
    expect(config.port).toBe(4000);
  });

  it('env vars override the config file', () => {
    const { config } = resolveStandaloneConfig({
      argv: [],
      env: { REDIS_HOST: 'env-host', PORT: '5000' },
      readConfigFile: () => fileConfig({ port: 4000, redis: { host: 'file-host' } }),
    });

    expect(config.host).toBe('localhost');
    expect(config.port).toBe(5000);
    expect(config.redis.host).toBe('env-host');
  });

  it('flags override env vars', () => {
    const { config } = resolveStandaloneConfig({
      argv: ['--redis-host', 'flag-host', '--port', '6000'],
      env: { REDIS_HOST: 'env-host', PORT: '5000' },
    });

    expect(config.redis.host).toBe('flag-host');
    expect(config.port).toBe(6000);
  });

  it('parses the comma-separated --queues allow-list', () => {
    const { config } = resolveStandaloneConfig({
      argv: ['--queues', 'emails,reports'],
      env: EMPTY_ENV,
    });

    expect(config.queues).toEqual(['emails', 'reports']);
  });

  it('parses the BULLMQ_DASH_QUEUES env allow-list', () => {
    const { config } = resolveStandaloneConfig({
      argv: [],
      env: { BULLMQ_DASH_QUEUES: 'emails,reports' },
    });

    expect(config.queues).toEqual(['emails', 'reports']);
  });

  it('treats an empty allow-list as unset', () => {
    const { config } = resolveStandaloneConfig({
      argv: ['--queues', ''],
      env: { BULLMQ_DASH_QUEUES: '' },
    });

    expect(config.queues).toBeUndefined();
  });

  it('ignores an empty redis password', () => {
    const { config } = resolveStandaloneConfig({
      argv: ['--redis-password', ''],
      env: EMPTY_ENV,
    });

    expect(config.redis.password).toBeUndefined();
  });

  it('rejects a non-numeric port', () => {
    expect(() =>
      resolveStandaloneConfig({ argv: ['--port', 'abc'], env: EMPTY_ENV })
    ).toThrow(/port/i);
  });

  it('rejects a negative port', () => {
    expect(() =>
      resolveStandaloneConfig({ argv: ['--port', '-1'], env: EMPTY_ENV })
    ).toThrow(/port/i);
  });

  it('rejects a non-numeric redis db from env', () => {
    expect(() =>
      resolveStandaloneConfig({ argv: [], env: { REDIS_DB: 'x' } })
    ).toThrow(/db/i);
  });

  it('rejects an unknown flag', () => {
    expect(() =>
      resolveStandaloneConfig({ argv: ['--nope'], env: EMPTY_ENV })
    ).toThrow(/nope/);
  });

  it('does not read the config file when --help is passed', () => {
    const readConfigFile = vi.fn();

    const { help, version } = resolveStandaloneConfig({
      argv: ['--help'],
      env: EMPTY_ENV,
      readConfigFile,
    });

    expect(help).toBe(true);
    expect(version).toBe(false);
    expect(readConfigFile).not.toHaveBeenCalled();
  });

  it('flags --version without reading the config file', () => {
    const readConfigFile = vi.fn();

    const { version } = resolveStandaloneConfig({
      argv: ['--version'],
      env: EMPTY_ENV,
      readConfigFile,
    });

    expect(version).toBe(true);
    expect(readConfigFile).not.toHaveBeenCalled();
  });

  it('propagates a config file read error', () => {
    expect(() =>
      resolveStandaloneConfig({
        argv: ['--config', './missing.json'],
        env: EMPTY_ENV,
        readConfigFile: () => {
          throw new Error("ENOENT: './missing.json'");
        },
      })
    ).toThrow(/ENOENT/);
  });
});

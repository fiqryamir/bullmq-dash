import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface PublishConfig {
  access?: string;
  provenance?: boolean;
}

interface PackageJson {
  name: string;
  version: string;
  private?: boolean;
  publishConfig?: PublishConfig;
  peerDependencies?: Record<string, string>;
}

const specDir = fileURLToPath(new URL('.', import.meta.url));
const packagesDir = resolve(specDir, '../..');

const suite = ['api', 'ui', 'express', 'fastify', 'nestjs', 'standalone'] as const;

function readPackage(name: (typeof suite)[number]): PackageJson {
  return JSON.parse(readFileSync(resolve(packagesDir, name, 'package.json'), 'utf8')) as PackageJson;
}

describe('release contract', () => {
  it('keeps every suite package on the same version', () => {
    const versions = suite.map((name) => readPackage(name).version);
    expect(new Set(versions).size).toBe(1);
  });

  it('marks every suite package public with provenance on publish', () => {
    for (const name of suite) {
      const pkg = readPackage(name);
      expect(pkg.publishConfig?.access, name).toBe('public');
      expect(pkg.publishConfig?.provenance, name).toBe(true);
    }
  });

  it('points the api ui peer range at the suite major', () => {
    const version = readPackage('api').version;
    const suiteMajor = version.split('.')[0];
    const range = readPackage('api').peerDependencies?.['@bullmq-dash/ui'];
    expect(range, '@bullmq-dash/api peer range on @bullmq-dash/ui').toMatch(
      new RegExp(`^\\^${suiteMajor}\\.`),
    );
  });
});

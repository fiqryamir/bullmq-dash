import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncLocales } from 'i18next-locales-sync';
import { describe, expect, it } from 'vitest';
import { LANGUAGES } from './languages';

// The same config `pnpm sync:locales` runs on, so this test can never drift
// from the real sync behaviour (the same guarantee bull-board's own
// i18n.spec.ts carries).
const localesFolder = path.resolve(__dirname, 'locales');
const primaryLanguage = 'en-US';
const secondaryLanguages = LANGUAGES.map((language) => language.code)
  .filter((code) => code !== primaryLanguage)
  .sort();
const spaces = 2;

const read = (p: string) => fs.readFileSync(p, 'utf8');

describe('i18n locales', () => {
  it('registers every locale folder in the languages list (and vice versa)', () => {
    const folders = fs
      .readdirSync(localesFolder)
      .filter((dir) => fs.existsSync(path.join(localesFolder, dir, 'messages.json')))
      .sort();
    expect(folders).toEqual([...LANGUAGES.map((language) => language.code)].sort());
  });

  it('ships a messages.json for every registered language', () => {
    for (const lng of LANGUAGES.map((language) => language.code)) {
      expect(fs.existsSync(path.join(localesFolder, lng, 'messages.json'))).toBe(true);
    }
  });

  // Guards against adding/removing a key in en-US without running
  // `pnpm sync:locales`. Re-runs the sync into a throwaway folder and asserts
  // it produces no changes, which is exactly what a synced tree looks like
  // (plurals expanded per CLDR).
  it('keeps every locale in sync with en-US (run `pnpm sync:locales`)', () => {
    const outputFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'bullmq-dash-locales-'));
    try {
      syncLocales({
        primaryLanguage,
        secondaryLanguages,
        localesFolder,
        outputFolder,
        spaces,
      });

      const outOfSync = secondaryLanguages.filter(
        (lng) =>
          read(path.join(localesFolder, lng, 'messages.json')) !==
          read(path.join(outputFolder, lng, 'messages.json'))
      );

      expect(outOfSync).toEqual([]);
    } finally {
      fs.rmSync(outputFolder, { recursive: true, force: true });
    }
  });
});

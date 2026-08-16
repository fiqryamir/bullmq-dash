import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { syncLocales } from 'i18next-locales-sync';

// Mirrors bull-board's `yarn sync:locales`: en-US is the primary language and
// every other locale folder is a secondary language. The sync copies new keys
// from en-US into every locale (existing translations are preserved) and
// expands plural keys per CLDR rules. Run it after editing en-US, or the
// i18n.spec sync test fails.
const localesFolder = resolve(import.meta.dirname, '../src/i18n/locales');
const primaryLanguage = 'en-US';
const secondaryLanguages = readdirSync(localesFolder)
  .filter((dir) => existsSync(join(localesFolder, dir, 'messages.json')))
  .sort();

syncLocales({ primaryLanguage, secondaryLanguages, localesFolder, spaces: 2 });

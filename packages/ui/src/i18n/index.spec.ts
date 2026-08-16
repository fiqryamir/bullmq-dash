import { afterEach, describe, expect, it } from 'vitest';
import { LOCALE_STORAGE_KEY, changeLocale, i18n, resolveInitialLng } from './index';
import { FALLBACK_LNG } from './languages';

afterEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage(FALLBACK_LNG);
});

describe('resolveInitialLng', () => {
  it('prefers a stored choice over everything else', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'de-DE');
    expect(resolveInitialLng('en-US')).toBe('de-DE');
  });

  it('uses the board-configured locale when nothing is stored', () => {
    expect(resolveInitialLng('fr-FR')).toBe('fr-FR');
  });

  it('falls back to the browser language when nothing is configured', () => {
    const original = navigator.language;
    Object.defineProperty(navigator, 'language', { configurable: true, value: 'ja-JP' });
    try {
      expect(resolveInitialLng()).toBe('ja-JP');
    } finally {
      Object.defineProperty(navigator, 'language', { configurable: true, value: original });
    }
  });

  it('resolves unsupported candidates to the English fallback', () => {
    expect(resolveInitialLng('xx-XX')).toBe(FALLBACK_LNG);
    expect(resolveInitialLng('de')).toBe(FALLBACK_LNG);
  });
});

describe('changeLocale', () => {
  it('loads the locale, switches the language and persists the choice', async () => {
    await changeLocale('de-DE');
    expect(i18n.language).toBe('de-DE');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('de-DE');
  });

  it('makes the catalog resolve to the chosen language', async () => {
    await changeLocale('de-DE');
    expect(i18n.t('QUEUE.STATUS.WAITING')).toBe('Wartend');
    expect(i18n.t('JOB.ACTIONS.RETRY')).toBe('Wiederholen');
  });

  it('ignores unsupported languages', async () => {
    await changeLocale('xx-XX');
    expect(i18n.language).toBe(FALLBACK_LNG);
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
  });
});

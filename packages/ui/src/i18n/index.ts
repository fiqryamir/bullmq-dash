import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Resource } from 'i18next';
import { FALLBACK_LNG, isSupportedLng, LANGUAGES } from './languages';
import enUS from './locales/en-US/messages.json';

export const LOCALE_STORAGE_KEY = 'bullmq-dash:locale';

/**
 * The locale files, code-split by Vite: en-US is bundled eagerly (it is the
 * fallback), every other locale is a chunk loaded on first use.
 */
const localeModules = import.meta.glob<{ default: Resource }>('./locales/*/messages.json');

/**
 * The language a fresh visit starts in: an explicit choice from a previous
 * visit wins, then the board's `uiConfig.locale.lng`, then the browser
 * language. Region-less browser values (`de`, `zh`) match their shipped
 * locale by language prefix; anything else resolves to en-US.
 */
export function resolveInitialLng(configured?: string): string {
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  const candidate = stored ?? configured ?? navigator.language;
  return matchLng(candidate);
}

function matchLng(lng: string): string {
  if (isSupportedLng(lng)) {
    return lng;
  }
  const prefix = lng.split('-')[0]?.toLowerCase() ?? '';
  const byPrefix = LANGUAGES.find(
    (language) => language.code.split('-')[0]?.toLowerCase() === prefix
  );
  return byPrefix?.code ?? FALLBACK_LNG;
}

i18n.use(initReactI18next).init({
  resources: { [FALLBACK_LNG]: { messages: enUS } },
  lng: FALLBACK_LNG,
  fallbackLng: FALLBACK_LNG,
  defaultNS: 'messages',
  ns: ['messages'],
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

/** Loads a locale's bundle into i18next without changing the language. */
export async function loadLocale(lng: string): Promise<void> {
  const module = localeModules[`./locales/${lng}/messages.json`];
  if (!module || i18n.hasResourceBundle(lng, 'messages')) {
    return;
  }
  const bundle = await module();
  i18n.addResourceBundle(lng, 'messages', bundle.default, true, true);
}

/**
 * Switches the active language and remembers the choice. The chosen locale is
 * kept in localStorage so a later visit opens in it.
 */
export async function changeLocale(lng: string): Promise<void> {
  if (!isSupportedLng(lng)) {
    return;
  }
  await loadLocale(lng);
  await i18n.changeLanguage(lng);
  window.localStorage.setItem(LOCALE_STORAGE_KEY, lng);
}

export { i18n };

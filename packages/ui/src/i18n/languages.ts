export type Language = { code: string; name: string };

/**
 * The locales the dashboard ships, in the order they appear in the locale
 * switcher. The same set bull-board ships; `name` is the language's native
 * name, shown as-is in every locale.
 */
export const LANGUAGES: readonly Language[] = [
  { code: 'en-US', name: 'English (US)' },
  { code: 'en-GB', name: 'English (UK)' },
  { code: 'da-DK', name: 'Dansk' },
  { code: 'de-DE', name: 'Deutsch' },
  { code: 'es-ES', name: 'Español' },
  { code: 'fr-FR', name: 'Français' },
  { code: 'ja-JP', name: '日本語' },
  { code: 'ko-KR', name: '한국어' },
  { code: 'pt-BR', name: 'Português (Brasil)' },
  { code: 'ru-RU', name: 'Русский' },
  { code: 'tr-TR', name: 'Türkçe' },
  { code: 'zh-CN', name: '简体中文' },
] as const;

export const FALLBACK_LNG = 'en-US';

export function isSupportedLng(lng: string): boolean {
  return LANGUAGES.some((language) => language.code === lng);
}

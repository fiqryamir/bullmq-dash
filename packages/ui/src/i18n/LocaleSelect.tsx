import { useTranslation } from 'react-i18next';
import { changeLocale, i18n } from './index';
import { LANGUAGES } from './languages';

/**
 * The language switcher in the app header. Options are the languages' native
 * names (no flags); the choice is persisted by `changeLocale`.
 */
export function LocaleSelect() {
  const { t } = useTranslation();

  return (
    <label className="locale-select">
      <span className="visually-hidden">{t('SETTINGS.LANGUAGE')}</span>
      <select
        className="dash-input dash-input--select"
        value={i18n.language}
        onChange={(event) => void changeLocale(event.target.value)}
      >
        {LANGUAGES.map((language) => (
          <option key={language.code} value={language.code}>
            {language.name}
          </option>
        ))}
      </select>
    </label>
  );
}

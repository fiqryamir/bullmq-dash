import { Switch } from '@base-ui-components/react/switch';
import { useTranslation } from 'react-i18next';
import { useTheme } from './ThemeProvider';

export function ThemeToggle() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();

  return (
    <Switch.Root
      checked={theme === 'light'}
      onCheckedChange={() => toggleTheme()}
      className="theme-switch"
      aria-label={t('COMMON.TOGGLE_THEME')}
    >
      <Switch.Thumb className="theme-switch__thumb" />
    </Switch.Root>
  );
}

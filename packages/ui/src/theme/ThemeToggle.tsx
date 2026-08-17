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
      className="dash-switch dash-focus-ring"
      aria-label={t('COMMON.TOGGLE_THEME')}
    >
      <Switch.Thumb className="dash-switch__thumb" />
    </Switch.Root>
  );
}

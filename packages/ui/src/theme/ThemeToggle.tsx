import { Switch } from '@base-ui-components/react/switch';
import { useTheme } from './ThemeProvider';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <Switch.Root
      checked={theme === 'light'}
      onCheckedChange={() => toggleTheme()}
      className="theme-switch"
      aria-label="Toggle theme"
    >
      <Switch.Thumb className="theme-switch__thumb" />
    </Switch.Root>
  );
}

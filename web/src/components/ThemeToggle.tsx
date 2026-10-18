import { ActionIcon, Tooltip } from '@mantine/core';
import { Icon } from './Icon.tsx';
import { useTheme } from '../lib/theme.ts';

export function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const dark = theme === 'dark';
  const label = dark ? 'Light theme' : 'Dark theme';
  return (
    <Tooltip label={label} withArrow>
      <ActionIcon
        variant="subtle"
        color="gray"
        size="md"
        aria-label={label}
        onClick={() => setTheme(dark ? 'light' : 'dark')}
      >
        <Icon name={dark ? 'sun' : 'moon'} />
      </ActionIcon>
    </Tooltip>
  );
}

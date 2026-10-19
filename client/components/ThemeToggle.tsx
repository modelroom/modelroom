import { ActionIcon, Tooltip } from '@mantine/core';
import { Icon } from './Icon.tsx';
import { useTheme } from '../lib/theme.ts';
import { useI18n } from '../lib/i18n.tsx';

export function ThemeToggle() {
  const { t } = useI18n();
  const [theme, setTheme] = useTheme();
  const dark = theme === 'dark';
  const label = dark ? t('common.themeLight') : t('common.themeDark');
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

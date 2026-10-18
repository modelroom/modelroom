import { Button } from './ui/button.tsx';
import { Icon } from './ui/Icon.tsx';
import { useTheme } from '../lib/theme.ts';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useTheme();
  const dark = theme === 'dark';
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className={className}
      title={dark ? 'Light theme' : 'Dark theme'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      <Icon name={dark ? 'sun' : 'moon'} className="size-4" />
    </Button>
  );
}

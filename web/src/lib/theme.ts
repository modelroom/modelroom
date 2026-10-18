// The theme is one attribute on <html>. Each shell sets it before paint (so the
// first frame is the right colour), and this hook keeps it and localStorage in
// step with the switch.

import { useEffect, useState } from 'react';
import { load, save } from './storage.ts';

export type Theme = 'light' | 'dark';

const KEY = 'modelroom.theme';

export function useTheme(): [Theme, (next: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() =>
    load<Theme>(KEY, document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'),
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    save(KEY, theme);
  }, [theme]);

  return [theme, setTheme];
}

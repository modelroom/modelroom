// The theme is one attribute on <html> — the one Mantine reads, so the switch
// re-themes every component at once. Each shell sets it before paint (so the
// first frame is the right colour), and this hook keeps it and localStorage in
// step with the switch.

import { useEffect, useState } from 'react';
import { load, save } from './storage.ts';

export type Theme = 'light' | 'dark';

const KEY = 'modelroom.theme';
const ATTR = 'data-mantine-color-scheme';

export function useTheme(): [Theme, (next: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() =>
    load<Theme>(KEY, document.documentElement.getAttribute(ATTR) === 'dark' ? 'dark' : 'light'),
  );

  useEffect(() => {
    document.documentElement.setAttribute(ATTR, theme);
    save(KEY, theme);
  }, [theme]);

  return [theme, setTheme];
}

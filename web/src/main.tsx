// The UI entry. One bundle serves four shells, picked from `data-app`: the room,
// the dashboard, settings and the component workshop.
//
// This is where the design system is installed: one `MantineProvider`, one
// theme, and the colour scheme the shells already resolved before paint. The
// language comes from the server once, before the first paint, so the UI never
// flashes English on a Japanese project.

import type { ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { cssVariablesResolver, theme } from './theme.ts';
import { useTheme } from './lib/theme.ts';
import { browserLang, I18nProvider, type Lang } from './lib/i18n.tsx';
import { ServerEventsProvider } from './hooks/useServerEvents.tsx';
import { DashboardApp } from './dashboard/DashboardApp.tsx';
import { SettingsApp } from './settings/SettingsApp.tsx';
import { RoomApp } from './room/RoomApp.tsx';
import { Kit } from './kit.tsx';

const APPS = {
  room: RoomApp,
  dashboard: DashboardApp,
  settings: SettingsApp,
  kit: Kit,
} as const;

type AppName = keyof typeof APPS;

function Root({ App, lang }: { App: ComponentType; lang: Lang }) {
  // The shells set `data-mantine-color-scheme` before paint; the hook keeps it,
  // localStorage and Mantine in step from then on.
  const [colorScheme] = useTheme();
  return (
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
      forceColorScheme={colorScheme}
    >
      <I18nProvider lang={lang}>
        <ServerEventsProvider>
          <App />
        </ServerEventsProvider>
      </I18nProvider>
    </MantineProvider>
  );
}

async function serverLang(): Promise<Lang> {
  try {
    const response = await fetch('/api/meta', { cache: 'no-store' });
    const data = (await response.json()) as { lang?: string };
    return data.lang === 'ja' ? 'ja' : data.lang === 'en' ? 'en' : browserLang();
  } catch {
    return browserLang();
  }
}

const root = document.getElementById('root');
if (root) {
  const name = (root.dataset.app ?? 'room') as AppName;
  const App = APPS[name] ?? RoomApp;
  const lang = await serverLang();
  document.documentElement.lang = lang;
  createRoot(root).render(<Root App={App} lang={lang} />);
}

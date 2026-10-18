// The UI entry. One bundle serves four shells, picked from `data-app`: the room,
// the dashboard, settings and the component workshop.
//
// This is where the design system is installed: one `MantineProvider`, one
// theme, and the colour scheme the shells already resolved before paint.

import type { ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { cssVariablesResolver, theme } from './theme.ts';
import { useTheme } from './lib/theme.ts';
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

function Root({ App }: { App: ComponentType }) {
  // The shells set `data-mantine-color-scheme` before paint; the hook keeps it,
  // localStorage and Mantine in step from then on.
  const [colorScheme] = useTheme();
  return (
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
      forceColorScheme={colorScheme}
    >
      <ServerEventsProvider>
        <App />
      </ServerEventsProvider>
    </MantineProvider>
  );
}

const root = document.getElementById('root');
if (root) {
  const name = (root.dataset.app ?? 'room') as AppName;
  const App = APPS[name] ?? RoomApp;
  createRoot(root).render(<Root App={App} />);
}

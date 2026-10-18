// The UI entry. One bundle serves four shells, picked from `data-app`: the room,
// the dashboard, settings and the component workshop.

import { createRoot } from 'react-dom/client';
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

const root = document.getElementById('root');
if (root) {
  const name = (root.dataset.app ?? 'room') as AppName;
  const App = APPS[name] ?? RoomApp;
  createRoot(root).render(
    <ServerEventsProvider>
      <App />
    </ServerEventsProvider>,
  );
}

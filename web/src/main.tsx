// The UI entry. One bundle serves two shells: the room (`data-app="room"`) and
// the component workshop (`data-app="kit"`), so nothing is shipped twice.

import { createRoot } from 'react-dom/client';
import { ServerEventsProvider } from './hooks/useServerEvents.tsx';
import { RoomApp } from './room/RoomApp.tsx';
import { Kit } from './kit.tsx';

const root = document.getElementById('root');
if (root) {
  const app = root.dataset.app === 'kit' ? <Kit /> : <RoomApp />;
  createRoot(root).render(<ServerEventsProvider>{app}</ServerEventsProvider>);
}

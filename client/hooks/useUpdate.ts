// The update notice's one source of truth.
//
// The check resolves *after* the first paint — the server fires it when it starts
// listening — so whatever the page loaded is only the first word. The server's
// `update` event is the news: the notice appears on a dashboard that was already
// open, without a reload and without polling.

import { useState } from 'react';
import type { UpdateInfo } from '../lib/api.ts';
import { useServerEvent } from './useServerEvents.tsx';

export function useUpdate(initial: UpdateInfo | null | undefined): UpdateInfo | null {
  const [live, setLive] = useState<UpdateInfo | null>(null);
  useServerEvent<UpdateInfo>('update', setLive);
  return live ?? initial ?? null;
}

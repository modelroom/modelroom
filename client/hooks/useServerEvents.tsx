// One EventSource for the whole page, fanned out to whoever subscribes.
//
// The server owns the stream (`/events`); this just keeps a single connection and
// hands each named event to the components that care, so a panel never opens its
// own socket.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { SERVER_EVENTS } from '../lib/events.ts';

export interface StatusEvent {
  phase: string;
  message: string;
  since: number;
}

interface ServerEventsValue {
  status: StatusEvent | null;
  connected: boolean;
  subscribe: (event: string, handler: (data: unknown) => void) => () => void;
}

const Ctx = createContext<ServerEventsValue | null>(null);

export const useServerEvents = (): ServerEventsValue => {
  const value = useContext(Ctx);
  if (!value) throw new Error('useServerEvents must be used inside <ServerEventsProvider>');
  return value;
};

export function ServerEventsProvider({ children }: { children: ReactNode }) {
  const listeners = useRef(new Map<string, Set<(data: unknown) => void>>());
  const [status, setStatus] = useState<StatusEvent | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource('/events');
    const emit = (event: string) => (raw: MessageEvent) => {
      let data: unknown = null;
      try {
        data = JSON.parse(raw.data);
      } catch {
        return;
      }
      if (event === 'status') setStatus(data as StatusEvent);
      for (const handler of listeners.current.get(event) ?? []) handler(data);
    };
    const bound = SERVER_EVENTS.map((event) => {
      const handler = emit(event);
      es.addEventListener(event, handler);
      return [event, handler] as const;
    });
    es.addEventListener('open', () => setConnected(true));
    es.addEventListener('error', () => setConnected(false));
    return () => {
      for (const [event, handler] of bound) es.removeEventListener(event, handler);
      es.close();
    };
  }, []);

  const subscribe = useCallback((event: string, handler: (data: unknown) => void) => {
    let set = listeners.current.get(event);
    if (!set) {
      set = new Set();
      listeners.current.set(event, set);
    }
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }, []);

  const value = useMemo(() => ({ status, connected, subscribe }), [status, connected, subscribe]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Run `handler` for every `event` from the server, without re-subscribing on render. */
export function useServerEvent<T>(event: string, handler: (data: T) => void): void {
  const { subscribe } = useServerEvents();
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => subscribe(event, (data) => latest.current(data as T)), [subscribe, event]);
}

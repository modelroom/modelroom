// The room, assembled: a navbar and four columns — chat · docs · artifact · session.
//
// Wide screens show all four; the handles between them move and the layout is
// remembered by the panel group. Narrow screens show one at a time, picked from
// the switch under the navbar.

import { useCallback, useEffect, useState } from 'react';
import { getRoom, postSession, type RoomResponse } from '../lib/api.ts';
import { load, save } from '../lib/storage.ts';
import { cn } from '../lib/utils.ts';
import { useChat } from '../hooks/useChat.ts';
import { useServerEvent, useServerEvents } from '../hooks/useServerEvents.tsx';
import { ArtifactPanel } from '../components/ArtifactPanel.tsx';
import { ChatPanel } from '../components/ChatPanel.tsx';
import { DocsPanel } from '../components/DocsPanel.tsx';
import { SessionPanel } from '../components/SessionPanel.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';
import { Badge } from '../components/ui/badge.tsx';
import { Button } from '../components/ui/button.tsx';
import { Icon } from '../components/ui/Icon.tsx';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '../components/ui/resizable.tsx';
import { Segmented } from '../components/ui/Segmented.tsx';

type MobileTab = 'chat' | 'docs' | 'artifact' | 'session';

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return matches;
}

const statusVariant = (status: string | null): 'success' | 'warning' | 'muted' =>
  /adopt|approv|done|complete|accept/i.test(status ?? '')
    ? 'success'
    : /review/i.test(status ?? '')
      ? 'warning'
      : 'muted';

export function RoomApp() {
  const room = decodeURIComponent(location.pathname.replace(/^\/room\//, '').split('?')[0] ?? '');
  const [data, setData] = useState<RoomResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chat = useChat(room);
  const { status, connected } = useServerEvents();

  const reload = useCallback(() => {
    void (async () => {
      try {
        const response = await getRoom(room);
        const maybe = response as unknown as { error?: string };
        if (maybe.error || !response.room) setError(maybe.error ?? 'cannot load this room');
        else setData(response);
      } catch {
        setError('cannot load this room');
      }
    })();
  }, [room]);

  useEffect(() => {
    reload();
  }, [reload]);
  useServerEvent<{ room: string }>('chat-done', (event) => {
    if (event.room === room) reload();
  });

  const narrow = useMediaQuery('(max-width: 1023px)');
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat');
  const [sessionOpen, setSessionOpen] = useState(() => load('modelroom.panels.session', true));
  useEffect(() => {
    save('modelroom.panels.session', sessionOpen);
  }, [sessionOpen]);

  const title = data?.room.title ?? data?.room.name ?? room;
  useEffect(() => {
    document.title = `${title} — modelroom`;
  }, [title]);

  const newSession = async () => {
    if (chat.running) return;
    if (!window.confirm('Start a new session for this room? The conversation context resets.'))
      return;
    const result = await postSession(room);
    if (result.sessionId) {
      chat.setSessionId(result.sessionId);
      chat.notice('new session started');
    }
  };

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" asChild>
            <a href="/">← Rooms</a>
          </Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Icon name="loader" className="size-4 animate-spin" />
        loading room…
      </div>
    );
  }

  const { config } = data;
  const agentLabel = `${config.agent.adapter} · ${config.agent.command}${config.agent.model ? ` · ${config.agent.model}` : ''}`;
  const sessionLabel = chat.sessionId ? `session ${chat.sessionId.slice(0, 16)}…` : '';
  const busy = status?.phase === 'chat' || status?.phase === 'rendering';

  const chatPanel = <ChatPanel room={room} chat={chat} agentLabel={agentLabel} />;
  const docsPanel = (
    <DocsPanel key={room} room={room} roomsPath={config.rooms} docs={config.docs} />
  );
  const artifactPanel = (
    <ArtifactPanel
      room={room}
      roomsPath={config.rooms}
      artifact={config.artifact}
      info={data.room}
    />
  );
  const sessionPanel = <SessionPanel room={room} />;

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
        <Button variant="ghost" size="sm" asChild>
          <a href="/">
            <Icon name="arrow-left" className="size-4" />
            Rooms
          </a>
        </Button>
        <span className="truncate font-semibold">{title}</span>
        <Badge variant="outline" className="hidden font-mono md:inline-flex">
          {config.rooms}/{data.room.name}
        </Badge>
        {data.room.status && (
          <Badge variant={statusVariant(data.room.status)}>{data.room.status}</Badge>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <span className="hidden font-mono text-[11px] text-muted-foreground lg:inline">
            {sessionLabel}
          </span>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => void newSession()}
            disabled={chat.running}
          >
            <Icon name="plus" className="size-3.5" />
            new session
          </Button>
          <ThemeToggle />
          {!narrow && (
            <Button
              variant="ghost"
              size="icon-xs"
              className={cn(sessionOpen && 'bg-muted text-foreground')}
              title={sessionOpen ? 'Hide session panel' : 'Show session panel'}
              onClick={() => setSessionOpen((open) => !open)}
            >
              <Icon name="panel-right" className="size-4" />
            </Button>
          )}
          <Badge
            variant="outline"
            className={cn(!connected && 'border-destructive text-destructive')}
          >
            {busy ? (
              <Icon name="loader" className="size-3 animate-spin" />
            ) : (
              <span
                className={cn('size-1.5 rounded-full', connected ? 'bg-success' : 'bg-destructive')}
              />
            )}
            {connected ? (status?.message ?? 'ready') : 'reconnecting…'}
          </Badge>
        </div>
      </div>

      {narrow ? (
        <>
          <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-1.5">
            <Segmented
              value={mobileTab}
              onChange={setMobileTab}
              options={[
                { value: 'chat', label: 'Chat' },
                { value: 'docs', label: 'Docs' },
                { value: 'artifact', label: 'Artifact' },
                { value: 'session', label: 'Session' },
              ]}
            />
          </div>
          <main className="flex min-h-0 flex-1 flex-col">
            {mobileTab === 'chat'
              ? chatPanel
              : mobileTab === 'docs'
                ? docsPanel
                : mobileTab === 'artifact'
                  ? artifactPanel
                  : sessionPanel}
          </main>
        </>
      ) : (
        <main className="flex min-h-0 flex-1">
          <ResizablePanelGroup direction="horizontal" autoSaveId="modelroom.room.layout">
            <ResizablePanel defaultSize={24} minSize={16}>
              {chatPanel}
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={28} minSize={18}>
              {docsPanel}
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={30} minSize={20}>
              {artifactPanel}
            </ResizablePanel>
            {sessionOpen && (
              <>
                <ResizableHandle />
                <ResizablePanel defaultSize={18} minSize={14}>
                  {sessionPanel}
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </main>
      )}
    </div>
  );
}

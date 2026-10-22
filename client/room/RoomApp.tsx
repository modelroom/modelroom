// The room, assembled: the chat on the left, and one tabbed surface on the right —
// the artifact, every doc, and the session (`RoomTabs`).
//
// Wide screens show the chat and that surface side by side; the handle between
// them moves and the layout is remembered by the panel group. Narrow screens have
// no room for a column, so the chat becomes the surface's first tab.
//
// The shell is Mantine's `AppShell`; the nav is `Button component="a"`.

import { useCallback, useEffect, useState } from 'react';
import { Alert, AppShell, Box, Button, Group, Loader, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { getRoom, postSession, type RoomResponse } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';
import { useChat } from '../hooks/useChat.ts';
import { useServerEvent, useServerEvents } from '../hooks/useServerEvents.tsx';
import { ChatPanel } from '../components/ChatPanel.tsx';
import { Icon } from '../components/Icon.tsx';
import { RoomTabs } from '../components/RoomTabs.tsx';
import { Split, SplitHandle, SplitPanel } from '../components/Split.tsx';
import { AgentStatus, ToneBadge, toneForStatus } from '../components/Status.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';
import { RoomActions } from './RoomActions.tsx';

export function RoomApp() {
  const { t } = useI18n();
  const room = decodeURIComponent(location.pathname.replace(/^\/rooms\//, '').split('?')[0] ?? '');
  const [data, setData] = useState<RoomResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chat = useChat(room);
  const { status, connected } = useServerEvents();

  const reload = useCallback(() => {
    void (async () => {
      try {
        const response = await getRoom(room);
        const maybe = response as unknown as { error?: string };
        if (maybe.error || !response.room) setError(maybe.error ?? t('room.cannotLoad'));
        else setData(response);
      } catch {
        setError(t('room.cannotLoad'));
      }
    })();
  }, [room, t]);

  useEffect(() => {
    reload();
  }, [reload]);
  useServerEvent<{ room: string }>('chat-done', (event) => {
    if (event.room === room) reload();
  });

  const narrow = useMediaQuery('(max-width: 1023px)');

  const title = data?.room.title ?? data?.room.name ?? room;
  useEffect(() => {
    document.title = `${title} — modelroom`;
  }, [title]);

  const newSession = async () => {
    if (chat.running) return;
    if (!window.confirm(t('room.newSessionConfirm'))) return;
    const result = await postSession(room);
    if (result.sessionId) {
      chat.setSessionId(result.sessionId);
      chat.notice(t('room.newSessionStarted'));
    }
  };

  if (error) {
    return (
      <Box h="100%" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
        <Alert color="danger" title={t('room.cannotOpen')} maw={420}>
          <Text size="sm" c="dimmed">
            {error}
          </Text>
          <Button
            component="a"
            href="/"
            size="compact-sm"
            variant="default"
            mt="sm"
            leftSection={<Icon name="arrow-left" size={14} />}
          >
            {t('common.rooms')}
          </Button>
        </Alert>
      </Box>
    );
  }

  if (!data) {
    return (
      <Group h="100%" gap="xs" justify="center" c="dimmed">
        <Loader size="sm" />
        <Text size="sm">{t('room.loading')}</Text>
      </Group>
    );
  }

  const { config } = data;
  const agentLabel = `${config.agent.adapter} · ${config.agent.command}${config.agent.model ? ` · ${config.agent.model}` : ''}`;
  const sessionLabel = chat.sessionId
    ? t('room.sessionLabel', { id: chat.sessionId.slice(0, 16) })
    : '';
  const busy = status?.phase === 'chat' || status?.phase === 'rendering';

  const chatPanel = <ChatPanel room={room} chat={chat} agentLabel={agentLabel} />;
  const contentTabs = (
    <RoomTabs
      room={room}
      roomsPath={config.rooms}
      artifact={config.artifact}
      docs={config.docs}
      info={data.room}
      snapshotDevice={data.room.device}
      devices={config.devices}
      chat={narrow ? chatPanel : undefined}
      session
    />
  );

  return (
    <AppShell header={{ height: 48 }} padding={0} withBorder={false}>
      <AppShell.Header>
        <Group h="100%" gap="xs" px="sm" wrap="nowrap">
          <Button
            component="a"
            href="/"
            variant="subtle"
            color="gray"
            size="compact-sm"
            leftSection={<Icon name="arrow-left" size={15} />}
          >
            {t('common.rooms')}
          </Button>
          <Text fw={600} truncate>
            {title}
          </Text>
          <Box visibleFrom="md">
            <ToneBadge tone="outline" ff="monospace">
              {config.rooms}/{data.room.name}
            </ToneBadge>
          </Box>
          {data.room.status && (
            <ToneBadge tone={toneForStatus(data.room.status)}>{data.room.status}</ToneBadge>
          )}
          <RoomActions
            room={data.room}
            names={data.names ?? [data.room.name]}
            prefix={config.rooms}
          />

          <Group gap="xs" ml="auto" wrap="nowrap">
            {sessionLabel && (
              <Text
                size="xs"
                ff="monospace"
                c="dimmed"
                visibleFrom="lg"
                style={{ whiteSpace: 'nowrap' }}
              >
                {sessionLabel}
              </Text>
            )}
            <Button
              variant="subtle"
              color="gray"
              size="compact-xs"
              onClick={() => void newSession()}
              disabled={chat.running}
              leftSection={<Icon name="plus" size={14} />}
            >
              {t('room.newSession')}
            </Button>
            <ThemeToggle />
            <AgentStatus connected={connected} busy={busy} message={status?.message} />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main
        style={{
          height: 'calc(100dvh - 48px)',
          display: 'flex',
          flexDirection: 'column',
          borderTop: '1px solid var(--mantine-color-default-border)',
        }}
      >
        {narrow ? (
          contentTabs
        ) : (
          <Split
            orientation="horizontal"
            autoSaveId="modelroom.room.layout.v2"
            style={{ flex: 1, minHeight: 0 }}
          >
            <SplitPanel defaultSize="32%" minSize="20%">
              {chatPanel}
            </SplitPanel>
            <SplitHandle />
            <SplitPanel defaultSize="68%" minSize="30%">
              {contentTabs}
            </SplitPanel>
          </Split>
        )}
      </AppShell.Main>
    </AppShell>
  );
}

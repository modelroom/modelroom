// The room, assembled: a navbar and four columns — chat · docs · artifact · session.
//
// Wide screens show all four; the handles between them move and the layout is
// remembered by the panel group. Narrow screens show one at a time, picked from
// the switch under the navbar.
//
// The shell is Mantine's `AppShell`; the nav is `Button component="a"` and
// `ActionIcon`.

import { useCallback, useEffect, useState } from 'react';
import {
  ActionIcon,
  Alert,
  AppShell,
  Box,
  Button,
  Group,
  Loader,
  SegmentedControl,
  Text,
  Tooltip,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { getRoom, postSession, type RoomResponse } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';
import { load, save } from '../lib/storage.ts';
import { useChat } from '../hooks/useChat.ts';
import { useServerEvent, useServerEvents } from '../hooks/useServerEvents.tsx';
import { ArtifactPanel } from '../components/ArtifactPanel.tsx';
import { ChatPanel } from '../components/ChatPanel.tsx';
import { DocsPanel } from '../components/DocsPanel.tsx';
import { Icon } from '../components/Icon.tsx';
import { SessionPanel } from '../components/SessionPanel.tsx';
import { Split, SplitHandle, SplitPanel } from '../components/Split.tsx';
import { AgentStatus, ToneBadge, toneForStatus } from '../components/Status.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';

type MobileTab = 'chat' | 'docs' | 'artifact' | 'session';

export function RoomApp() {
  const { t } = useI18n();
  const tabs = [
    { value: 'chat', label: t('room.chat') },
    { value: 'docs', label: t('room.docs') },
    { value: 'artifact', label: t('room.artifact') },
    { value: 'session', label: t('room.session') },
  ];
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
  const docsPanel = (
    <DocsPanel key={room} room={room} roomsPath={config.rooms} docs={config.docs} />
  );
  const artifactPanel = (
    <ArtifactPanel
      room={room}
      roomsPath={config.rooms}
      artifact={config.artifact}
      info={data.room}
      snapshotDevice={config.thumbnail.device}
    />
  );
  const sessionPanel = <SessionPanel room={room} />;

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
            {!narrow && (
              <Tooltip
                label={sessionOpen ? t('room.hideSession') : t('room.showSession')}
                withArrow
              >
                <ActionIcon
                  variant={sessionOpen ? 'light' : 'subtle'}
                  color="gray"
                  size="md"
                  aria-label={sessionOpen ? t('room.hideSession') : t('room.showSession')}
                  aria-pressed={sessionOpen}
                  onClick={() => setSessionOpen((open) => !open)}
                >
                  <Icon name="panel-right" size={16} />
                </ActionIcon>
              </Tooltip>
            )}
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
          <>
            <Box
              px="sm"
              py={6}
              style={{
                borderBottom: '1px solid var(--mantine-color-default-border)',
                flexShrink: 0,
              }}
            >
              <SegmentedControl
                size="xs"
                value={mobileTab}
                onChange={(value) => setMobileTab(value as MobileTab)}
                data={tabs}
                fullWidth
                aria-label={t('room.sessionPanel')}
              />
            </Box>
            <Box style={{ flex: 1, display: 'flex', minHeight: 0 }}>
              {mobileTab === 'chat'
                ? chatPanel
                : mobileTab === 'docs'
                  ? docsPanel
                  : mobileTab === 'artifact'
                    ? artifactPanel
                    : sessionPanel}
            </Box>
          </>
        ) : (
          <Split
            direction="horizontal"
            autoSaveId="modelroom.room.layout"
            style={{ flex: 1, minHeight: 0 }}
          >
            <SplitPanel defaultSize={24} minSize={16}>
              {chatPanel}
            </SplitPanel>
            <SplitHandle />
            <SplitPanel defaultSize={28} minSize={18}>
              {docsPanel}
            </SplitPanel>
            <SplitHandle />
            <SplitPanel defaultSize={30} minSize={20}>
              {artifactPanel}
            </SplitPanel>
            {sessionOpen && (
              <>
                <SplitHandle />
                <SplitPanel defaultSize={18} minSize={14}>
                  {sessionPanel}
                </SplitPanel>
              </>
            )}
          </Split>
        )}
      </AppShell.Main>
    </AppShell>
  );
}

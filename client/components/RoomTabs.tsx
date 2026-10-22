// The room's content, as tabs: the artifact, every doc, and — in the room itself —
// the session.
//
// It is the one surface the detail view and the dashboard's preview drawer share;
// the drawer simply asks for it without the session tab. The artifact is first and
// default, so a room opens on its screen. On a narrow screen the chat has no column
// of its own, so it is passed in as a `chat` node and becomes the first tab.
//
// A tab whose content changed while you were looking elsewhere gets a dot: the
// server already streams the change, so this only listens — no polling — and the
// dot goes when you open the tab.

import { useState, type ReactNode } from 'react';
import { Box, Group, Tabs } from '@mantine/core';
import type { DeviceInfo, RoomInfo } from '../lib/api.ts';
import { docLabel } from '../lib/format.ts';
import { useI18n } from '../lib/i18n.tsx';
import { useServerEvent } from '../hooks/useServerEvents.tsx';
import { ArtifactPanel } from './ArtifactPanel.tsx';
import { DocView } from './DocView.tsx';
import { Icon } from './Icon.tsx';
import { SessionPanel } from './SessionPanel.tsx';

const ARTIFACT = '__artifact__';
const SESSION = '__session__';
const CHAT = '__chat__';

const PANEL = {
  display: 'flex',
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  flexDirection: 'column',
} as const;

/** The unread mark: a small filled dot beside the tab's label. */
function UnreadDot() {
  return (
    <Box
      className="mr-tab-dot"
      w={6}
      h={6}
      style={{ borderRadius: 999, backgroundColor: 'var(--mantine-primary-color-filled)' }}
    />
  );
}

export function RoomTabs({
  room,
  roomsPath,
  artifact,
  docs,
  info,
  snapshotDevice,
  devices,
  chat,
  session = false,
}: {
  room: string;
  roomsPath: string;
  artifact: string;
  docs: string[];
  info: RoomInfo;
  /** The device this room's snapshot uses; "make png" starts here. */
  snapshotDevice: string;
  /** Every device the project knows, built-ins first. */
  devices: DeviceInfo[];
  /** The chat, on a narrow screen where it has no column of its own. */
  chat?: ReactNode;
  /** Whether to show the session tab (the detail view; not the preview drawer). */
  session?: boolean;
}) {
  const { t } = useI18n();
  const [active, setActive] = useState<string>(chat ? CHAT : ARTIFACT);
  /** Tabs whose content changed while you were looking at another one. */
  const [unread, setUnread] = useState<Record<string, boolean>>({});

  const mark = (tab: string) => {
    if (tab === active) return;
    setUnread((current) => (current[tab] ? current : { ...current, [tab]: true }));
  };

  // A changed file belongs to a tab: a doc of its own, or — the artifact, a
  // referenced asset, its png — the artifact tab.
  const tabForFile = (file: string): string | null => {
    const prefix = `${roomsPath}/${room}/`;
    if (!file.startsWith(prefix)) return null;
    const base = file.slice(prefix.length);
    return docs.includes(base) ? base : ARTIFACT;
  };

  useServerEvent<{ file: string }>('change', (data) => {
    const tab = tabForFile(data.file);
    if (tab) mark(tab);
  });
  useServerEvent<{ room: string }>('render-done', (data) => {
    if (!data.room || data.room === room) mark(ARTIFACT);
  });

  const select = (value: string | null) => {
    const next = value ?? ARTIFACT;
    setActive(next);
    setUnread((current) => (current[next] ? { ...current, [next]: false } : current));
  };

  return (
    <Tabs
      value={active}
      onChange={select}
      style={{
        display: 'flex',
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        flexDirection: 'column',
        backgroundColor: 'var(--mr-panel)',
      }}
    >
      <Group
        gap="xs"
        px="xs"
        py={4}
        wrap="wrap"
        style={{
          borderBottom: '1px solid var(--mantine-color-default-border)',
          flexShrink: 0,
        }}
      >
        <Tabs.List
          className="mr-scroll"
          style={{ flexWrap: 'nowrap', overflowX: 'auto', borderBottom: 'none' }}
        >
          {chat && (
            <Tabs.Tab value={CHAT} leftSection={<Icon name="terminal" size={13} />}>
              {t('room.chat')}
            </Tabs.Tab>
          )}
          <Tabs.Tab value={ARTIFACT} leftSection={unread[ARTIFACT] ? <UnreadDot /> : undefined}>
            {t('room.artifact')}
          </Tabs.Tab>
          {docs.map((name) => (
            <Tabs.Tab
              key={name}
              value={name}
              leftSection={unread[name] ? <UnreadDot /> : undefined}
            >
              {docLabel(name)}
            </Tabs.Tab>
          ))}
          {session && <Tabs.Tab value={SESSION}>{t('room.session')}</Tabs.Tab>}
        </Tabs.List>
      </Group>

      {chat && (
        <Tabs.Panel value={CHAT} style={PANEL}>
          {chat}
        </Tabs.Panel>
      )}
      <Tabs.Panel value={ARTIFACT} style={PANEL}>
        <ArtifactPanel
          room={room}
          roomsPath={roomsPath}
          artifact={artifact}
          info={info}
          snapshotDevice={snapshotDevice}
          devices={devices}
        />
      </Tabs.Panel>
      {docs.map((name) => (
        <Tabs.Panel key={name} value={name} style={PANEL}>
          <DocView key={name} room={room} roomsPath={roomsPath} name={name} />
        </Tabs.Panel>
      ))}
      {session && (
        <Tabs.Panel value={SESSION} style={PANEL}>
          <SessionPanel room={room} />
        </Tabs.Panel>
      )}
    </Tabs>
  );
}
